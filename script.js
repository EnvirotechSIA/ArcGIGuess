/* =============================================================================
 * ArcGIGuess — Game logic
 * =============================================================================
 * Pazudusī Latvija — Atrodi vietu kartē
 * ========================================================================== */

$arcgis
    .import([
        "@arcgis/core/config.js",
        "@arcgis/core/WebMap.js",
        "@arcgis/core/Graphic.js",
        "@arcgis/core/request.js",
        "@arcgis/core/geometry/operators/distanceOperator.js",
    ])
    .then(([esriConfig, WebMap, Graphic, esriRequest, distanceOperator]) => {
        const CONFIG = window.ARCGIGUESS_CONFIG;
        const LEADERBOARD = CONFIG.leaderboard || {};

        const $ = (id) => document.getElementById(id);
        const mapEl = document.querySelector("arcgis-map");

        const panels = {
            start: $("start-panel"),
            loading: $("loading-panel"),
            game: $("game-panel"),
            roundResult: $("round-result-panel"),
            gameOver: $("game-over-panel"),
            shareModal: $("share-modal"),
            submitModal: $("submit-modal"),
            leaderboardModal: $("leaderboard-modal"),
            leaderboardLoading: $("leaderboard-loading"),
            leaderboardList: $("leaderboard-list"),
        };

        const buttons = {
            langToggle: $("lang-toggle"),
            start: $("start-button"),
            confirm: $("confirm-button"),
            next: $("next-button"),
            finishEarly: $("finish-early-button"),
            playAgain: $("play-again-button"),
            share: $("share-button"),
            closeModal: $("close-modal-button"),
            submitScore: $("submit-score-button"),
            viewLeaderboard: $("view-leaderboard-button"),
            closeSubmitModal: $("close-submit-modal-button"),
            closeLeaderboardModal: $("close-leaderboard-modal-button"),
        };

        const imageElements = {
            container: $("landmark-image-container"),
            image: $("landmark-image"),
            spinner: $("image-spinner"),
        };

        const LANGUAGES = CONFIG.languages || [];
        const LANG_BY_CODE = {};

        LANGUAGES.forEach((lang) => {
            LANG_BY_CODE[lang.code] = lang;
        });

        const DEFAULT_LANG = LANGUAGES[0];

        let currentLanguage = DEFAULT_LANG ? DEFAULT_LANG.code : "lv";
        let gameState = "LOADING";

        let landmarkPool = [];
        let allLandmarks = [];

        let currentLandmarkIndex = 0;
        let totalScore = 0;
        let accuracyTracker = [];

        let clickedPoint = null;

        let webmap;
        let landmarksLayer;

        let clicksEnabled = false;

        let finishEarlyArmed = false;
        let finishEarlyTimer = null;

        const PIN_IMAGE = "./assets/pin.svg";
        const PIN_WIDTH = 28;
        const PIN_HEIGHT = 42;
        const PIN_REST_YOFFSET = PIN_HEIGHT / 2;

        function makePinSymbol(yoffset) {
            return {
                type: "picture-marker",
                url: PIN_IMAGE,
                width: PIN_WIDTH,
                height: PIN_HEIGHT,
                yoffset,
            };
        }

        const correctPointSymbol = {
            type: "simple-marker",
            style: "circle",
            color: [22, 163, 74, 0.95],
            size: 16,
            outline: {
                color: "white",
                width: 3,
            },
        };

        const correctAreaSymbol = {
            type: "simple-fill",
            color: [50, 205, 50, 0.3],
            outline: {
                color: "white",
                width: 2,
            },
        };

        const incorrectAreaSymbol = {
            type: "simple-fill",
            color: [220, 20, 60, 0.3],
            outline: {
                color: "white",
                width: 2,
            },
        };

        function currentLang() {
            return LANG_BY_CODE[currentLanguage] || DEFAULT_LANG;
        }

        function t(key, replacements = {}) {
            const active = currentLang();

            let text =
                (active &&
                    active.strings &&
                    active.strings[key]) ||
                (DEFAULT_LANG &&
                    DEFAULT_LANG.strings &&
                    DEFAULT_LANG.strings[key]) ||
                key;

            const values = {
                appName: CONFIG.appName || "",
                url: (CONFIG.social && CONFIG.social.url) || "",
                ...replacements,
            };

            for (const [placeholder, value] of Object.entries(values)) {
                text = text.split(`{${placeholder}}`).join(value);
            }

            return text;
        }

        function buildScoringSummary() {
            const s = CONFIG.scoring || {
                pointsForHit: 10,
                bucketMeters: 500,
                penaltyPerBucket: 1,
                minScore: 0,
            };

            return t("scoringSummaryTemplate", {
                points: s.pointsForHit,
                bucket: s.bucketMeters,
                penalty: s.penaltyPerBucket,
                min: s.minScore,
            });
        }

        function showPanel(panelName) {
            for (const panel of Object.values(panels)) {
                if (panel) {
                    panel.classList.add("hidden");
                }
            }

            if (panels[panelName]) {
                panels[panelName].classList.remove("hidden");
            }
        }

        function updateUI() {
            const activeLang = currentLang();

            document.documentElement.lang = currentLanguage;
            document.body.dir = (activeLang && activeLang.dir) || "ltr";

            if (buttons.langToggle) {
                buttons.langToggle.innerText =
                    (activeLang && activeLang.toggleLabel) ||
                    currentLanguage.toUpperCase();

                buttons.langToggle.classList.toggle(
                    "hidden",
                    LANGUAGES.length < 2
                );
            }

            if ($("welcome-title")) {
                $("welcome-title").innerHTML = t("welcomeTitle");
            }

            if ($("welcome-desc")) {
                $("welcome-desc").innerHTML = t("welcomeDesc", {
                    scoringSummary: buildScoringSummary(),
                });
            }

            if (buttons.start) {
                buttons.start.innerText = t("startButton");
            }

            if ($("loading-text")) {
                $("loading-text").innerText = t("loadingText");
            }

            if ($("find-landmark-text")) {
                $("find-landmark-text").innerText = t("findLandmarkText");
            }

            if ($("score-display")) {
                $("score-display").innerText = t("scoreDisplay", {
                    score: totalScore,
                });
            }

            if ($("round-display") && allLandmarks.length > 0) {
                $("round-display").innerText = t("roundDisplay", {
                    current: currentLandmarkIndex + 1,
                    total: allLandmarks.length,
                });
            }

            if (buttons.confirm) {
                buttons.confirm.innerText = t("confirmButton");
            }

            const canFinishEarly =
                CONFIG.allowFinishEarly &&
                gameState === "PLAYING" &&
                currentLandmarkIndex < allLandmarks.length - 1;

            if (buttons.finishEarly) {
                buttons.finishEarly.classList.toggle("hidden", !canFinishEarly);

                if (!finishEarlyArmed) {
                    buttons.finishEarly.innerText = t("finishEarlyButton");
                }
            }

            if (buttons.next) {
                buttons.next.innerText = t(
                    currentLandmarkIndex === allLandmarks.length - 1
                        ? "gameOverButton"
                        : "nextButton"
                );
            }

            if ($("game-over-title")) {
                $("game-over-title").innerText = t("gameOverTitle");
            }

            if ($("final-score-text")) {
                $("final-score-text").innerText = t("finalScoreText");
            }

            if ($("total-score-label")) {
                $("total-score-label").innerText = t("totalScoreLabel");
            }

            if ($("accuracy-label")) {
                $("accuracy-label").innerText = t("accuracyLabel");
            }

            if ($("found-label")) {
                $("found-label").innerText = t("foundLabel");
            }

            if (buttons.playAgain) {
                buttons.playAgain.innerText = t("playAgainButton");
            }

            if (buttons.share) {
                buttons.share.innerText = t("shareButton");
            }

            if (buttons.submitScore) {
                buttons.submitScore.innerText = t("submitScoreButton");
            }

            if (buttons.viewLeaderboard) {
                buttons.viewLeaderboard.innerText = t("viewLeaderboardButton");
            }

            if ($("share-modal-title")) {
                $("share-modal-title").innerText = t("shareModalTitle");
            }

            if ($("share-modal-desc")) {
                $("share-modal-desc").innerText = t("shareModalDesc");
            }

            if ($("submit-modal-title")) {
                $("submit-modal-title").innerText = t("submitModalTitle");
            }

            if ($("leaderboard-modal-title")) {
                $("leaderboard-modal-title").innerText = t(
                    "leaderboardModalTitle"
                );
            }

            if ($("leaderboard-loading-text")) {
                $("leaderboard-loading-text").innerText = t(
                    "leaderboardLoadingText"
                );
            }

            if ($("share-card-title")) {
                $("share-card-title").innerText = t("shareCardTitle");
            }

            if ($("share-card-score-label")) {
                $("share-card-score-label").innerText = t("shareCardScoreLabel");
            }

            if ($("share-card-accuracy-label")) {
                $("share-card-accuracy-label").innerText = t(
                    "shareCardAccuracyLabel"
                );
            }

            if ($("share-card-found-label")) {
                $("share-card-found-label").innerText = t("foundLabel");
            }

            switch (gameState) {
                case "LOADING":
                    showPanel("loading");
                    break;

                case "START":
                    showPanel("start");
                    break;

                case "PLAYING":
                    showPanel("game");

                    if (buttons.confirm) {
                        buttons.confirm.classList.toggle("hidden", !clickedPoint);
                    }
                    break;

                case "ROUND_RESULT":
                    showPanel("roundResult");
                    break;

                case "GAME_OVER":
                    showPanel("gameOver");
                    break;
            }
        }

        function toggleLanguage() {
            if (LANGUAGES.length < 2) return;

            const idx = LANGUAGES.findIndex(
                (lang) => lang.code === currentLanguage
            );

            currentLanguage = LANGUAGES[(idx + 1) % LANGUAGES.length].code;

            updateUI();

            if (gameState === "PLAYING" && allLandmarks[currentLandmarkIndex]) {
                const landmark = allLandmarks[currentLandmarkIndex];

                if ($("landmark-name")) {
                    $("landmark-name").innerText = getLandmarkName(landmark);
                }
            }
        }

        function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));

                [array[i], array[j]] = [array[j], array[i]];
            }

            return array;
        }

        function dataURLtoFile(dataUrl, filename) {
            return fetch(dataUrl)
                .then((res) => res.blob())
                .then((blob) => new File([blob], filename, { type: blob.type }));
        }

        function getLandmarkName(feature) {
            if (!feature || !feature.attributes) {
                return "Nezināma vieta";
            }

            const lang = currentLang();
            const field = (lang && lang.landmarkNameField) || "Name";

            return feature.attributes[field] || "Nezināma vieta";
        }

        function getLandmarkPhoto(feature) {
            if (!feature || !feature.attributes) {
                return null;
            }

            if (feature.attributes.imageUrl) {
                return String(feature.attributes.imageUrl).trim();
            }

            const field = CONFIG.landmarkPhotoField || "Photo";
            const value = feature.attributes[field];

            if (!value) return null;

            return String(value).trim();
        }

        function getTargetGeometry(feature) {
            return feature ? feature.geometry : null;
        }

        function getDistanceMeters(targetGeometry, guessPoint) {
            if (!targetGeometry || !guessPoint) return 0;

            try {
                const distance = distanceOperator.execute(
                    targetGeometry,
                    guessPoint,
                    {
                        unit: "meters",
                    }
                );

                if (typeof distance === "number" && !Number.isNaN(distance)) {
                    return Math.max(0, distance);
                }
            } catch (error) {
                console.warn("Distance calculation failed:", error);
            }

            return 0;
        }

        function isDirectHit(targetGeometry, guessPoint) {
            if (!targetGeometry || !guessPoint) return false;

            const scoring = CONFIG.scoring || {
                bucketMeters: 500,
            };

            const distance = getDistanceMeters(targetGeometry, guessPoint);

            return distance <= scoring.bucketMeters;
        }

        function getResultSymbol(geometry, gotFullPoints) {
            if (!geometry) {
                return correctPointSymbol;
            }

            if (geometry.type === "polygon" || geometry.type === "extent") {
                return gotFullPoints ? correctAreaSymbol : incorrectAreaSymbol;
            }

            return correctPointSymbol;
        }

        async function init() {
            try {
                if (!mapEl) {
                    alert("Kartes elements <arcgis-map> nav atrasts index.html failā.");
                    return;
                }

                if (CONFIG.portalUrl) {
                    esriConfig.portalUrl = CONFIG.portalUrl;
                }

                webmap = new WebMap({
                    portalItem: {
                        id: CONFIG.webMapItemId,
                    },
                });

                mapEl.map = webmap;

                await webmap.load();

                console.log(
                    "WebMap layers:",
                    webmap.layers.map((layer) => layer.title).toArray
                        ? webmap.layers.map((layer) => layer.title).toArray()
                        : webmap.layers.map((layer) => layer.title)
                );

                landmarksLayer = webmap.layers.find(
                    (layer) => layer.title === "Vietas"
                );

                if (!landmarksLayer) {
                    console.error("Layer not found: Vietas");
                    alert(
                        "Tīmekļa kartē neizdevās atrast slāni “Vietas”. Pārbaudi, vai layer name tiešām ir Vietas."
                    );
                    return;
                }

                landmarksLayer.visible = false;

                await mapEl.viewOnReady();

                await loadGameData();

                gameState = "START";

                updateUI();
            } catch (error) {
                console.error("Initialization error:", error);

                alert(
                    "Neizdevās ielādēt spēles datus. Pārbaudi Web Map ID, slāni “Vietas”, publisko piekļuvi un laukus FID/Name/Photo."
                );

                gameState = "LOADING";
                updateUI();
            }
        }

        function loadGameData() {
            try {
                const query = landmarksLayer.createQuery();

                query.where = "1=1";

                /*
                 * Drošākais variants:
                 * ņemam visus laukus, lai nekristu kļūda, ja FID/Photo/Name
                 * ArcGIS pusē ir field alias vai lauks nav pieprasāms atsevišķi.
                 */
                query.outFields = ["*"];

                query.returnGeometry = true;

                return landmarksLayer
                    .queryFeatures(query)
                    .then((featureSet) => {
                        console.log("FeatureSet:", featureSet);

                        const landmarks = featureSet.features.filter((feature) => {
                            return feature.geometry;
                        });

                        landmarks.forEach((feature) => {
                            const photoUrl = feature.attributes.Photo;

                            feature.attributes.imageUrl = photoUrl
                                ? String(photoUrl).trim()
                                : null;
                        });

                        landmarkPool = landmarks;
                        allLandmarks = landmarks.slice();

                        console.log("Landmarks loaded:", landmarkPool);

                        if (landmarkPool[0]) {
                            console.log(
                                "First feature attributes:",
                                landmarkPool[0].attributes
                            );
                        }

                        if (!landmarkPool.length) {
                            alert(
                                "Netika atrasta neviena vieta. Pārbaudi, vai slānī “Vietas” ir punkti/poligoni ar ģeometriju."
                            );
                        }

                        return landmarks;
                    })
                    .catch((error) => {
                        console.error("Error querying landmark data:", error);

                        alert(
                            "Neizdevās ielādēt vietu datus. Pārbaudi, vai slānis “Vietas” ir publisks un vai tam ir ieslēgta Query/Extract piekļuve."
                        );

                        return Promise.reject(error);
                    });
            } catch (error) {
                console.error("Error creating query:", error);

                alert("Neizdevās izveidot vietu datu pieprasījumu.");

                return Promise.reject(error);
            }
        }

        function startGame() {
            currentLandmarkIndex = 0;
            totalScore = 0;
            accuracyTracker = [];
            clickedPoint = null;

            if (mapEl.graphics) {
                mapEl.graphics.removeAll();
            }

            allLandmarks = CONFIG.shuffleLandmarks
                ? shuffleArray(landmarkPool.slice())
                : landmarkPool.slice();

            if (CONFIG.roundsPerGame) {
                allLandmarks = allLandmarks.slice(0, CONFIG.roundsPerGame);
            }

            if (!allLandmarks.length) {
                alert("Nav pieejamu vietu spēlei.");
                return;
            }

            startRound();
        }

        function startRound() {
            clickedPoint = null;

            if (mapEl.graphics) {
                mapEl.graphics.removeAll();
            }

            resetFinishEarly();

            const landmark = allLandmarks[currentLandmarkIndex];

            const name = getLandmarkName(landmark);
            const imageUrl = getLandmarkPhoto(landmark);

            if ($("landmark-name")) {
                $("landmark-name").innerText = name;
            }

            if (imageUrl && imageElements.container && imageElements.image) {
                imageElements.container.classList.remove("hidden");
                imageElements.image.classList.add("hidden");

                if (imageElements.spinner) {
                    imageElements.spinner.classList.remove("hidden");
                }

                imageElements.image.onload = () => {
                    imageElements.image.classList.remove("hidden");

                    if (imageElements.spinner) {
                        imageElements.spinner.classList.add("hidden");
                    }
                };

                imageElements.image.onerror = () => {
                    imageElements.container.classList.add("hidden");

                    if (imageElements.spinner) {
                        imageElements.spinner.classList.add("hidden");
                    }
                };

                imageElements.image.src = imageUrl;
                imageElements.image.alt = name;
            } else {
                if (imageElements.container) {
                    imageElements.container.classList.add("hidden");
                }

                if (imageElements.spinner) {
                    imageElements.spinner.classList.add("hidden");
                }

                if (imageElements.image) {
                    imageElements.image.removeAttribute("src");
                }
            }

            gameState = "PLAYING";
            clicksEnabled = true;

            updateUI();
        }

        function handleMapClick(mapPoint) {
            if (!clicksEnabled) return;

            clickedPoint = mapPoint;

            if (mapEl.graphics) {
                mapEl.graphics.removeAll();
            }

            const pinGraphic = new Graphic({
                geometry: clickedPoint,
                symbol: makePinSymbol(PIN_REST_YOFFSET),
            });

            mapEl.graphics.add(pinGraphic);

            animatePinDrop(pinGraphic);

            updateUI();
        }

        function animatePinDrop(graphic) {
            const dropHeight = 60;
            const duration = 650;
            const start = performance.now();

            function frame(now) {
                const p = Math.min((now - start) / duration, 1);
                const extra = dropHeight * (1 - easeOutBounce(p));

                graphic.symbol = makePinSymbol(PIN_REST_YOFFSET + extra);

                if (p < 1) {
                    requestAnimationFrame(frame);
                }
            }

            requestAnimationFrame(frame);
        }

        function easeOutBounce(x) {
            const n1 = 7.5625;
            const d1 = 2.75;

            if (x < 1 / d1) {
                return n1 * x * x;
            }

            if (x < 2 / d1) {
                return n1 * (x -= 1.5 / d1) * x + 0.75;
            }

            if (x < 2.5 / d1) {
                return n1 * (x -= 2.25 / d1) * x + 0.9375;
            }

            return n1 * (x -= 2.625 / d1) * x + 0.984375;
        }

        function confirmGuess() {
            if (!clickedPoint) return;

            clicksEnabled = false;

            const targetLandmark = allLandmarks[currentLandmarkIndex];
            const targetGeometry = getTargetGeometry(targetLandmark);

            const scoring = CONFIG.scoring || {
                pointsForHit: 10,
                bucketMeters: 500,
                penaltyPerBucket: 1,
                minScore: 0,
            };

            const distanceInMeters = getDistanceMeters(
                targetGeometry,
                clickedPoint
            );

            const hit = isDirectHit(targetGeometry, clickedPoint);

            let roundScore;

            if (hit) {
                roundScore = scoring.pointsForHit;
            } else {
                const bands = Math.floor(
                    distanceInMeters / scoring.bucketMeters
                );

                const penalty = bands * scoring.penaltyPerBucket;

                roundScore = Math.max(
                    scoring.minScore,
                    scoring.pointsForHit - penalty
                );
            }

            const gotFullPoints = roundScore === scoring.pointsForHit;

            let resultTitle;
            let resultMessage;

            if (gotFullPoints) {
                resultTitle = t("correctTitle");
                resultMessage = t("correctMessage", {
                    roundScore,
                });
                accuracyTracker.push(1);
            } else {
                resultTitle = t("incorrectTitle");
                resultMessage = t("incorrectMessage", {
                    distance: Math.round(distanceInMeters),
                    roundScore,
                });
                accuracyTracker.push(0);
            }

            totalScore += roundScore;

            if ($("round-result-title")) {
                $("round-result-title").innerText = resultTitle;

                $("round-result-title").style.color = gotFullPoints
                    ? "#16a34a"
                    : "#dc2626";
            }

            if ($("round-result-message")) {
                $("round-result-message").innerHTML = resultMessage;
            }

            const answerGraphic = new Graphic({
                geometry: targetGeometry,
                symbol: getResultSymbol(targetGeometry, gotFullPoints),
            });

            mapEl.graphics.add(answerGraphic);

            goToAnswer(targetGeometry);

            gameState = "ROUND_RESULT";

            updateUI();
        }

        function goToAnswer(geometry) {
            if (!geometry) return;

            let target = geometry;

            if (geometry.extent) {
                target = geometry.extent.expand(1.8);
            }

            mapEl.goTo(target).catch((error) => {
                if (error && error.name !== "AbortError") {
                    console.error(error);
                }
            });
        }

        function resetFinishEarly() {
            finishEarlyArmed = false;

            if (finishEarlyTimer) {
                clearTimeout(finishEarlyTimer);
                finishEarlyTimer = null;
            }

            if (buttons.finishEarly) {
                buttons.finishEarly.classList.remove("armed");
                buttons.finishEarly.innerText = t("finishEarlyButton");
            }
        }

        function handleFinishEarly() {
            if (!finishEarlyArmed) {
                finishEarlyArmed = true;

                buttons.finishEarly.classList.add("armed");
                buttons.finishEarly.innerText = t("finishEarlyConfirm");

                finishEarlyTimer = setTimeout(resetFinishEarly, 3000);

                return;
            }

            resetFinishEarly();

            clicksEnabled = false;

            endGame();
        }

        function nextRound() {
            currentLandmarkIndex++;

            if (currentLandmarkIndex < allLandmarks.length) {
                startRound();
            } else {
                endGame();
            }
        }

        function endGame() {
            gameState = "GAME_OVER";
            clicksEnabled = false;

            updateUI();

            const total = allLandmarks.length || 1;
            const foundCount = accuracyTracker.filter(
                (value) => value === 1
            ).length;

            const accuracy = Math.round((foundCount / total) * 100);
            const foundText = `${foundCount} / ${allLandmarks.length}`;

            if ($("total-score")) {
                $("total-score").innerText = totalScore;
            }

            if ($("accuracy")) {
                $("accuracy").innerText = `${accuracy}%`;
            }

            if ($("found-count")) {
                $("found-count").innerText = foundText;
            }

            if ($("share-card-score")) {
                $("share-card-score").innerText = totalScore;
            }

            if ($("share-card-accuracy")) {
                $("share-card-accuracy").innerText = `${accuracy}%`;
            }

            if ($("share-card-found")) {
                $("share-card-found").innerText = foundText;
            }
        }

        function shareResults() {
            const shareCard = $("share-card");

            if (!shareCard || typeof html2canvas === "undefined") {
                return;
            }

            const fileName = `${CONFIG.appName
                .replace(/\s+/g, "-")
                .toLowerCase()}-results.png`;

            shareCard.classList.remove("hidden");
            shareCard.style.position = "absolute";
            shareCard.style.left = "-9999px";

            setTimeout(() => {
                html2canvas(shareCard, {
                    scale: 2,
                    useCORS: true,
                })
                    .then((canvas) => {
                        const dataUrl = canvas.toDataURL("image/png");

                        return dataURLtoFile(dataUrl, fileName).then((file) => ({
                            dataUrl,
                            file,
                        }));
                    })
                    .then(({ dataUrl, file }) => {
                        hideShareCard();

                        if (
                            navigator.share &&
                            navigator.canShare &&
                            navigator.canShare({ files: [file] })
                        ) {
                            return navigator.share({
                                title: t("shareCardTitle"),
                                text: t("shareText", {
                                    score: totalScore,
                                }),
                                files: [file],
                            });
                        }

                        if ($("share-image-preview")) {
                            $("share-image-preview").src = dataUrl;
                        }

                        if (panels.shareModal) {
                            panels.shareModal.classList.remove("hidden");
                        }
                    })
                    .catch((error) => {
                        console.error("Share error:", error);

                        hideShareCard();
                    });
            }, 100);
        }

        function hideShareCard() {
            const shareCard = $("share-card");

            if (!shareCard) return;

            shareCard.classList.add("hidden");
            shareCard.style.position = "";
            shareCard.style.left = "";
        }

        function showSubmitModal() {
            if (!LEADERBOARD.enabled) return;

            const fieldId = LEADERBOARD.submitScoreFieldId;

            let url = `${LEADERBOARD.survey123Url}?${fieldId}=${totalScore}&hide=navbar,header,description,footer,${fieldId}`;

            const surveyLang = currentLang() && currentLang().surveyLang;

            if (surveyLang) {
                url += `&lang=${surveyLang}`;
            }

            if ($("survey-iframe")) {
                $("survey-iframe").src = url;
            }

            if (panels.submitModal) {
                panels.submitModal.classList.remove("hidden");
            }
        }

        function showLeaderboard() {
            if (!LEADERBOARD.enabled) return;

            panels.leaderboardModal.classList.remove("hidden");
            panels.leaderboardLoading.classList.remove("hidden");
            panels.leaderboardList.classList.add("hidden");
            panels.leaderboardList.innerHTML = "";

            fetchLeaderboardData();
        }

        function fetchLeaderboardData() {
            const queryParams = {
                f: "json",
                where: "1=1",
                outFields: `${LEADERBOARD.firstNameField},${LEADERBOARD.lastNameField},${LEADERBOARD.scoreField}`,
                orderByFields: `${LEADERBOARD.scoreField} DESC`,
                resultRecordCount: LEADERBOARD.topN,
            };

            esriRequest(LEADERBOARD.dataApiUrl, {
                query: queryParams,
                responseType: "json",
            })
                .then((response) => {
                    const features = response.data.features;
                    populateLeaderboard(features);
                })
                .catch((error) => {
                    console.error("Leaderboard error:", error);

                    panels.leaderboardLoading.classList.add("hidden");
                    panels.leaderboardList.classList.remove("hidden");

                    panels.leaderboardList.innerHTML = `<li class="text-red-600">${t(
                        "leaderboardError"
                    )}</li>`;
                });
        }

        function populateLeaderboard(features) {
            panels.leaderboardLoading.classList.add("hidden");
            panels.leaderboardList.classList.remove("hidden");

            if (!features || features.length === 0) {
                panels.leaderboardList.innerHTML = `<li>${t("noScores")}</li>`;
                return;
            }

            features.forEach((feature, index) => {
                const firstName =
                    feature.attributes[LEADERBOARD.firstNameField] || "";

                const lastName =
                    feature.attributes[LEADERBOARD.lastNameField] || "";

                const name = `${firstName} ${lastName}`.trim() || "Anonymous";

                const score = feature.attributes[LEADERBOARD.scoreField] || 0;

                const li = document.createElement("li");
                li.className =
                    "p-3 bg-gray-100 rounded-lg flex justify-between items-center";

                const nameSpan = document.createElement("span");
                nameSpan.className = "font-bold text-lg text-blue-700";
                nameSpan.textContent = `${index + 1}. ${name}`;

                const scoreSpan = document.createElement("span");
                scoreSpan.className = "font-semibold text-lg";
                scoreSpan.textContent = `${score} ${t("points")}`;

                li.appendChild(nameSpan);
                li.appendChild(scoreSpan);

                panels.leaderboardList.appendChild(li);
            });
        }

        function applyStaticConfig() {
            document.title = `${CONFIG.appName} | ${CONFIG.tagline}`;

            const logoAlt = `${CONFIG.appName} Logo`;

            [$("start-logo"), $("share-logo")].forEach((img) => {
                if (img) {
                    img.alt = logoAlt;
                }
            });

            if ($("share-card-footer")) {
                $("share-card-footer").innerText =
                    CONFIG.shareCardFooter || CONFIG.tagline;
            }

            applySocialMeta();

            if (!LEADERBOARD || !LEADERBOARD.enabled) {
                if (buttons.submitScore) {
                    buttons.submitScore.classList.add("hidden");
                }

                if (buttons.viewLeaderboard) {
                    buttons.viewLeaderboard.classList.add("hidden");
                }
            }
        }

        function applySocialMeta() {
            const s = CONFIG.social;

            if (!s) return;

            const setMeta = (selector, value) => {
                if (value == null || value === "") return;

                const el = document.head.querySelector(selector);

                if (el) {
                    el.setAttribute("content", value);
                }
            };

            setMeta('meta[name="description"]', s.description);
            setMeta('meta[property="og:site_name"]', CONFIG.appName);
            setMeta('meta[property="og:title"]', s.title);
            setMeta('meta[property="og:description"]', s.description);
            setMeta('meta[property="og:image"]', s.image);
            setMeta('meta[property="og:url"]', s.url);
            setMeta('meta[name="twitter:title"]', s.title);
            setMeta('meta[name="twitter:description"]', s.description);
            setMeta('meta[name="twitter:image"]', s.image);
            setMeta('meta[name="twitter:site"]', s.twitterHandle);
            setMeta('meta[name="twitter:creator"]', s.twitterHandle);
        }

        if (mapEl) {
            mapEl.addEventListener("arcgisViewClick", (event) => {
                if (clicksEnabled) {
                    handleMapClick(event.detail.mapPoint);
                }
            });
        }

        if (buttons.langToggle) {
            buttons.langToggle.addEventListener("click", toggleLanguage);
        }

        if (buttons.start) {
            buttons.start.addEventListener("click", startGame);
        }

        if (buttons.confirm) {
            buttons.confirm.addEventListener("click", confirmGuess);
        }

        if (buttons.next) {
            buttons.next.addEventListener("click", nextRound);
        }

        if (buttons.finishEarly) {
            buttons.finishEarly.addEventListener("click", handleFinishEarly);
        }

        if (buttons.playAgain) {
            buttons.playAgain.addEventListener("click", startGame);
        }

        if (buttons.share) {
            buttons.share.addEventListener("click", shareResults);
        }

        if (buttons.closeModal) {
            buttons.closeModal.addEventListener("click", () => {
                if (panels.shareModal) {
                    panels.shareModal.classList.add("hidden");
                }
            });
        }

        if (buttons.submitScore) {
            buttons.submitScore.addEventListener("click", showSubmitModal);
        }

        if (buttons.viewLeaderboard) {
            buttons.viewLeaderboard.addEventListener("click", showLeaderboard);
        }

        if (buttons.closeSubmitModal) {
            buttons.closeSubmitModal.addEventListener("click", () => {
                if (panels.submitModal) {
                    panels.submitModal.classList.add("hidden");
                }

                if ($("survey-iframe")) {
                    $("survey-iframe").src = "";
                }
            });
        }

        if (buttons.closeLeaderboardModal) {
            buttons.closeLeaderboardModal.addEventListener("click", () => {
                if (panels.leaderboardModal) {
                    panels.leaderboardModal.classList.add("hidden");
                }
            });
        }

        applyStaticConfig();

        init();

        updateUI();

        window.skipToResults = () => {
            console.log("Skipping to results with a random score.");

            if (allLandmarks.length === 0) {
                allLandmarks = new Array(5).fill(1);
            }

            totalScore =
                Math.floor(Math.random() * (allLandmarks.length * 8)) + 10;

            accuracyTracker = allLandmarks.map(() =>
                Math.random() > 0.5 ? 1 : 0
            );

            endGame();
        };
    });
