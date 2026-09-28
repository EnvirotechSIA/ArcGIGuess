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
        "@arcgis/core/Basemap.js",
        "@arcgis/core/layers/TileLayer.js",
    ])
    .then(
        async ([
            esriConfig,
            WebMap,
            Graphic,
            esriRequest,
            distanceOperator,
            Basemap,
            TileLayer,
        ]) => {

            const CONFIG = window.ARCGIGUESS_CONFIG || {};
            const LEADERBOARD = CONFIG.leaderboard || {};

            const $ = (id) =>
                document.getElementById(id);

            const mapEl =
                document.querySelector("arcgis-map");

            /* =================================================================
             * PANELS
             * ================================================================= */

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
                closeSubmitModal:
                    $("close-submit-modal-button"),
                closeLeaderboardModal:
                    $("close-leaderboard-modal-button"),
            };

            const imageElements = {
                container:
                    $("landmark-image-container"),
                image:
                    $("landmark-image"),
                spinner:
                    $("image-spinner"),
            };

            /* =================================================================
             * LANGUAGE
             * ================================================================= */

            const LANGUAGES =
                CONFIG.languages || [];

            const LANG_BY_CODE = {};

            LANGUAGES.forEach((lang) => {
                LANG_BY_CODE[lang.code] = lang;
            });

            const DEFAULT_LANG =
                LANGUAGES[0];

            let currentLanguage =
                DEFAULT_LANG
                    ? DEFAULT_LANG.code
                    : "lv";

            /* =================================================================
             * GAME STATE
             * ================================================================= */

            let gameState = "LOADING";

            let landmarkPool = [];
            let allLandmarks = [];

            let currentLandmarkIndex = 0;
            let totalScore = 0;
            let accuracyTracker = [];

            let clickedPoint = null;

            let webmap = null;
            let landmarksLayer = null;

            let clicksEnabled = false;

            let finishEarlyArmed = false;
            let finishEarlyTimer = null;

            /* =================================================================
             * MAP
             * ================================================================= */

            const PIN_IMAGE =
                "./assets/pin.svg";

            const PIN_WIDTH = 28;
            const PIN_HEIGHT = 42;
            const PIN_REST_YOFFSET =
                PIN_HEIGHT / 2;

            let topoBasemap = null;
            let imageryBasemap = null;

            let currentBasemapType = null;

            /*
             * Zoom threshold.
             *
             * Mazs zoom:
             *   OpenStreetMap / topo
             *
             * Liels zoom:
             *   ArcGIS World Imagery
             */
            const IMAGERY_ZOOM = 11;

            /* =================================================================
             * BASEMAPS
             * ================================================================= */

            function createBasemaps() {

                console.log(
                    "[Basemap] Creating basemaps..."
                );

                /*
                 * ArcGIS Online World Topographic Map
                 */
                const topoLayer =
                    new TileLayer({
                        url:
                            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer",
                    });

                topoBasemap =
                    new Basemap({
                        baseLayers: [
                            topoLayer,
                        ],
                        title:
                            "ArcGIS Topographic",
                        id:
                            "arcgis-topographic",
                    });

                /*
                 * ArcGIS Online World Imagery
                 */
                const imageryLayer =
                    new TileLayer({
                        url:
                            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
                    });

                imageryBasemap =
                    new Basemap({
                        baseLayers: [
                            imageryLayer,
                        ],
                        title:
                            "ArcGIS World Imagery",
                        id:
                            "arcgis-world-imagery",
                    });

                console.log(
                    "[Basemap] Basemaps created."
                );
            }

            function setBasemapSafely(
                basemap,
                type
            ) {

                if (
                    !mapEl ||
                    !mapEl.map ||
                    !basemap
                ) {
                    return;
                }

                if (
                    currentBasemapType ===
                    type
                ) {
                    return;
                }

                try {

                    mapEl.map.basemap =
                        basemap;

                    currentBasemapType =
                        type;

                    console.log(
                        "[Basemap] switched to:",
                        type
                    );

                } catch (error) {

                    console.error(
                        "[Basemap] switch failed:",
                        error
                    );
                }
            }

            function updateBasemapForZoom(
                zoom
            ) {

                if (
                    typeof zoom !==
                    "number"
                ) {
                    return;
                }

                /*
                 * Tālāk:
                 * ArcGIS Topographic
                 */
                if (
                    zoom <
                    IMAGERY_ZOOM
                ) {

                    setBasemapSafely(
                        topoBasemap,
                        "topo"
                    );

                    return;
                }

                /*
                 * Tuvāk:
                 * ArcGIS World Imagery
                 */
                setBasemapSafely(
                    imageryBasemap,
                    "imagery"
                );
            }

            function setupBasemapSwitching() {

                if (
                    !mapEl ||
                    !mapEl.view
                ) {
                    console.warn(
                        "[Basemap] View nav pieejams."
                    );

                    return;
                }

                console.log(
                    "[Basemap] Setting up zoom switching."
                );

                /*
                 * Uzreiz iestatām sākotnējo basemap.
                 */
                updateBasemapForZoom(
                    mapEl.view.zoom
                );

                /*
                 * Klausāmies uz zoom.
                 */
                mapEl.view.watch(
                    "zoom",
                    (zoom) => {
                        updateBasemapForZoom(
                            zoom
                        );
                    }
                );
            }

            /* =================================================================
             * SYMBOLS
             * ================================================================= */

            function makePinSymbol(
                yoffset
            ) {

                return {
                    type:
                        "picture-marker",
                    url:
                        PIN_IMAGE,
                    width:
                        PIN_WIDTH,
                    height:
                        PIN_HEIGHT,
                    yoffset:
                        yoffset,
                };
            }

            const correctPointSymbol = {
                type:
                    "simple-marker",
                style:
                    "circle",
                color:
                    [22, 163, 74, 0.95],
                size:
                    16,
                outline: {
                    color:
                        "white",
                    width:
                        3,
                },
            };

            const correctAreaSymbol = {
                type:
                    "simple-fill",
                color:
                    [50, 205, 50, 0.3],
                outline: {
                    color:
                        "white",
                    width:
                        2,
                },
            };

            const incorrectAreaSymbol = {
                type:
                    "simple-fill",
                color:
                    [220, 20, 60, 0.3],
                outline: {
                    color:
                        "white",
                    width:
                        2,
                },
            };

            /* =================================================================
             * LANGUAGE
             * ================================================================= */

            function currentLang() {

                return (
                    LANG_BY_CODE[
                        currentLanguage
                    ] ||
                    DEFAULT_LANG ||
                    {
                        strings: {},
                    }
                );
            }

            function t(
                key,
                replacements = {}
            ) {

                const active =
                    currentLang();

                let text =
                    (
                        active &&
                        active.strings &&
                        active.strings[key]
                    ) ||
                    (
                        DEFAULT_LANG &&
                        DEFAULT_LANG.strings &&
                        DEFAULT_LANG.strings[key]
                    ) ||
                    key;

                const values = {
                    appName:
                        CONFIG.appName ||
                        "",
                    url:
                        (
                            CONFIG.social &&
                            CONFIG.social.url
                        ) ||
                        "",
                    ...replacements,
                };

                Object.entries(
                    values
                ).forEach(
                    ([placeholder, value]) => {

                        text =
                            text
                                .split(
                                    `{${placeholder}}`
                                )
                                .join(
                                    value
                                );
                    }
                );

                return text;
            }

            function buildScoringSummary() {

                const s =
                    CONFIG.scoring ||
                    {
                        pointsForHit:
                            10,
                        bucketMeters:
                            500,
                        penaltyPerBucket:
                            1,
                        minScore:
                            0,
                    };

                return t(
                    "scoringSummaryTemplate",
                    {
                        points:
                            s.pointsForHit,
                        bucket:
                            s.bucketMeters,
                        penalty:
                            s.penaltyPerBucket,
                        min:
                            s.minScore,
                    }
                );
            }

            /* =================================================================
             * UI
             * ================================================================= */

            function showPanel(
                panelName
            ) {

                Object.values(
                    panels
                ).forEach(
                    (panel) => {

                        if (panel) {
                            panel.classList.add(
                                "hidden"
                            );
                        }
                    }
                );

                if (
                    panels[panelName]
                ) {

                    panels[
                        panelName
                    ].classList.remove(
                        "hidden"
                    );
                }
            }

            function updateUI() {

                const activeLang =
                    currentLang();

                document.documentElement.lang =
                    currentLanguage;

                document.body.dir =
                    activeLang.dir ||
                    "ltr";

                if (
                    buttons.langToggle
                ) {

                    buttons.langToggle.innerText =
                        activeLang.toggleLabel ||
                        currentLanguage.toUpperCase();

                    buttons.langToggle.classList.toggle(
                        "hidden",
                        LANGUAGES.length <
                            2
                    );
                }

                if (
                    $("welcome-title")
                ) {
                    $("welcome-title").innerHTML =
                        t(
                            "welcomeTitle"
                        );
                }

                if (
                    $("welcome-desc")
                ) {
                    $("welcome-desc").innerHTML =
                        t(
                            "welcomeDesc",
                            {
                                scoringSummary:
                                    buildScoringSummary(),
                            }
                        );
                }

                if (
                    buttons.start
                ) {
                    buttons.start.innerText =
                        t(
                            "startButton"
                        );
                }

                if (
                    $("loading-text")
                ) {
                    $("loading-text").innerText =
                        t(
                            "loadingText"
                        );
                }

                if (
                    $("find-landmark-text")
                ) {
                    $("find-landmark-text").innerText =
                        t(
                            "findLandmarkText"
                        );
                }

                if (
                    $("score-display")
                ) {
                    $("score-display").innerText =
                        t(
                            "scoreDisplay",
                            {
                                score:
                                    totalScore,
                            }
                        );
                }

                if (
                    $("round-display") &&
                    allLandmarks.length
                ) {

                    $("round-display").innerText =
                        t(
                            "roundDisplay",
                            {
                                current:
                                    currentLandmarkIndex +
                                    1,
                                total:
                                    allLandmarks.length,
                            }
                        );
                }

                if (
                    buttons.confirm
                ) {

                    buttons.confirm.innerText =
                        t(
                            "confirmButton"
                        );
                }

                const canFinishEarly =
                    CONFIG.allowFinishEarly &&
                    gameState ===
                        "PLAYING" &&
                    currentLandmarkIndex <
                        allLandmarks.length -
                            1;

                if (
                    buttons.finishEarly
                ) {

                    buttons.finishEarly.classList.toggle(
                        "hidden",
                        !canFinishEarly
                    );

                    if (
                        !finishEarlyArmed
                    ) {

                        buttons.finishEarly.innerText =
                            t(
                                "finishEarlyButton"
                            );
                    }
                }

                if (
                    buttons.next
                ) {

                    buttons.next.innerText =
                        t(
                            currentLandmarkIndex ===
                                allLandmarks.length -
                                    1
                                ? "gameOverButton"
                                : "nextButton"
                        );
                }

                if (
                    $("game-over-title")
                ) {
                    $("game-over-title").innerText =
                        t(
                            "gameOverTitle"
                        );
                }

                if (
                    $("final-score-text")
                ) {
                    $("final-score-text").innerText =
                        t(
                            "finalScoreText"
                        );
                }

                if (
                    $("total-score-label")
                ) {
                    $("total-score-label").innerText =
                        t(
                            "totalScoreLabel"
                        );
                }

                if (
                    $("accuracy-label")
                ) {
                    $("accuracy-label").innerText =
                        t(
                            "accuracyLabel"
                        );
                }

                if (
                    $("found-label")
                ) {
                    $("found-label").innerText =
                        t(
                            "foundLabel"
                        );
                }

                if (
                    buttons.playAgain
                ) {
                    buttons.playAgain.innerText =
                        t(
                            "playAgainButton"
                        );
                }

                if (
                    buttons.share
                ) {
                    buttons.share.innerText =
                        t(
                            "shareButton"
                        );
                }

                if (
                    buttons.submitScore
                ) {
                    buttons.submitScore.innerText =
                        t(
                            "submitScoreButton"
                        );
                }

                if (
                    buttons.viewLeaderboard
                ) {
                    buttons.viewLeaderboard.innerText =
                        t(
                            "viewLeaderboardButton"
                        );
                }

                if (
                    $("share-modal-title")
                ) {
                    $("share-modal-title").innerText =
                        t(
                            "shareModalTitle"
                        );
                }

                if (
                    $("share-modal-desc")
                ) {
                    $("share-modal-desc").innerText =
                        t(
                            "shareModalDesc"
                        );
                }

                if (
                    $("submit-modal-title")
                ) {
                    $("submit-modal-title").innerText =
                        t(
                            "submitModalTitle"
                        );
                }

                if (
                    $("leaderboard-modal-title")
                ) {
                    $("leaderboard-modal-title").innerText =
                        t(
                            "leaderboardModalTitle"
                        );
                }

                if (
                    $("leaderboard-loading-text")
                ) {
                    $("leaderboard-loading-text").innerText =
                        t(
                            "leaderboardLoadingText"
                        );
                }

                if (
                    $("share-card-title")
                ) {
                    $("share-card-title").innerText =
                        t(
                            "shareCardTitle"
                        );
                }

                if (
                    $("share-card-score-label")
                ) {
                    $("share-card-score-label").innerText =
                        t(
                            "shareCardScoreLabel"
                        );
                }

                if (
                    $("share-card-accuracy-label")
                ) {
                    $("share-card-accuracy-label").innerText =
                        t(
                            "shareCardAccuracyLabel"
                        );
                }

                if (
                    $("share-card-found-label")
                ) {
                    $("share-card-found-label").innerText =
                        t(
                            "foundLabel"
                        );
                }

                switch (
                    gameState
                ) {

                    case "LOADING":
                        showPanel(
                            "loading"
                        );
                        break;

                    case "START":
                        showPanel(
                            "start"
                        );
                        break;

                    case "PLAYING":

                        showPanel(
                            "game"
                        );

                        if (
                            buttons.confirm
                        ) {
                            buttons.confirm.classList.toggle(
                                "hidden",
                                !clickedPoint
                            );
                        }

                        break;

                    case "ROUND_RESULT":
                        showPanel(
                            "roundResult"
                        );
                        break;

                    case "GAME_OVER":
                        showPanel(
                            "gameOver"
                        );
                        break;
                }
            }

            /* =================================================================
             * LANDMARK HELPERS
             * ================================================================= */

            function getLandmarkName(
                feature
            ) {

                if (
                    !feature ||
                    !feature.attributes
                ) {
                    return "Nezināma vieta";
                }

                const lang =
                    currentLang();

                const field =
                    lang.landmarkNameField ||
                    "Name";

                return (
                    feature.attributes[
                        field
                    ] ||
                    "Nezināma vieta"
                );
            }

            function getLandmarkPhoto(
                feature
            ) {

                if (
                    !feature ||
                    !feature.attributes
                ) {
                    return null;
                }

                if (
                    feature.attributes
                        .imageUrl
                ) {

                    return String(
                        feature.attributes
                            .imageUrl
                    ).trim();
                }

                const field =
                    CONFIG.landmarkPhotoField ||
                    "Photo";

                const value =
                    feature.attributes[
                        field
                    ];

                if (!value) {
                    return null;
                }

                return String(
                    value
                ).trim();
            }

            function getTargetGeometry(
                feature
            ) {

                return feature
                    ? feature.geometry
                    : null;
            }

            /* =================================================================
             * DISTANCE
             * ================================================================= */

            function getDistanceMeters(
                targetGeometry,
                guessPoint
            ) {

                if (
                    !targetGeometry ||
                    !guessPoint
                ) {
                    return 0;
                }

                try {

                    const distance =
                        distanceOperator.execute(
                            targetGeometry,
                            guessPoint,
                            {
                                unit:
                                    "meters",
                            }
                        );

                    if (
                        typeof distance ===
                            "number" &&
                        !Number.isNaN(
                            distance
                        )
                    ) {

                        return Math.max(
                            0,
                            distance
                        );
                    }

                } catch (
                    error
                ) {

                    console.warn(
                        "Distance calculation failed:",
                        error
                    );
                }

                return 0;
            }

            function isDirectHit(
                targetGeometry,
                guessPoint
            ) {

                if (
                    !targetGeometry ||
                    !guessPoint
                ) {
                    return false;
                }

                const scoring =
                    CONFIG.scoring ||
                    {
                        bucketMeters:
                            500,
                    };

                const distance =
                    getDistanceMeters(
                        targetGeometry,
                        guessPoint
                    );

                return (
                    distance <=
                    scoring.bucketMeters
                );
            }

            /* =================================================================
             * INIT
             * ================================================================= */

            async function init() {

                try {

                    console.log(
                        "[INIT] Starting..."
                    );

                    if (!mapEl) {

                        alert(
                            "Kartes elements <arcgis-map> nav atrasts."
                        );

                        return;
                    }

                    if (
                        CONFIG.portalUrl
                    ) {

                        esriConfig.portalUrl =
                            CONFIG.portalUrl;
                    }

                    /*
                     * Izveidojam basemap objektus.
                     */
                    createBasemaps();

                    /*
                     * Izveidojam WebMap.
                     */
                    webmap =
                        new WebMap({
                            portalItem: {
                                id:
                                    CONFIG.webMapItemId,
                            },
                        });

                    mapEl.map =
                        webmap;

                    console.log(
                        "[INIT] WebMap assigned."
                    );

                    /*
                     * GAIDĀM WEBMAP IELĀDI.
                     */
                    await webmap.load();

                    console.log(
                        "[INIT] WebMap loaded."
                    );

                    /*
                     * Atrodam Vietas layer.
                     */
                    landmarksLayer =
                        webmap.layers.find(
                            (layer) =>
                                layer.title ===
                                "Vietas"
                        );

                    if (
                        !landmarksLayer
                    ) {

                        console.error(
                            "Layer 'Vietas' not found."
                        );

                        alert(
                            "Tīmekļa kartē nav atrasts slānis “Vietas”."
                        );

                        return;
                    }

                    landmarksLayer.visible =
                        false;

                    console.log(
                        "[INIT] Vietas layer found."
                    );

                    /*
                     * ArcGIS Map component
                     * view gatavību.
                     *
                     * SVARĪGI:
                     * Neizmantojam await viewOnReady(),
                     * ja konkrētā ArcGIS 5.1 komponentes
                     * implementācija to neatbalsta.
                     */

                    if (
                        !mapEl.view
                    ) {

                        console.log(
                            "[INIT] Waiting for map view..."
                        );

                        await new Promise(
                            (
                                resolve
                            ) => {

                                const check =
                                    () => {

                                        if (
                                            mapEl.view
                                        ) {

                                            resolve();
                                            return;
                                        }

                                        setTimeout(
                                            check,
                                            100
                                        );
                                    };

                                check();
                            }
                        );
                    }

                    console.log(
                        "[INIT] Map view ready."
                    );

                    /*
                     * Basemap switching
                     * NEBLOĶĒ spēli.
                     */
                    try {

                        setupBasemapSwitching();

                    } catch (
                        basemapError
                    ) {

                        console.warn(
                            "[INIT] Basemap switching failed, continuing:",
                            basemapError
                        );
                    }

                    /*
                     * Ielādējam spēles datus.
                     */
                    await loadGameData();

                    console.log(
                        "[INIT] Game data loaded."
                    );

                    if (
                        !landmarkPool.length
                    ) {

                        alert(
                            "Netika atrasta neviena vieta slānī “Vietas”."
                        );

                        return;
                    }

                    gameState =
                        "START";

                    updateUI();

                    console.log(
                        "[INIT] COMPLETE."
                    );

                } catch (
                    error
                ) {

                    console.error(
                        "[INIT] ERROR:",
                        error
                    );

                    console.error(
                        error &&
                            error.stack
                            ? error.stack
                            : ""
                    );

                    alert(
                        "Neizdevās ielādēt spēli. Pārbaudi pārlūka Console (F12), lai redzētu precīzu kļūdu."
                    );

                    /*
                     * Atstājam loading paneli,
                     * bet kļūda būs redzama Console.
                     */
                    gameState =
                        "LOADING";

                    updateUI();
                }
            }

            /* =================================================================
             * DATA
             * ================================================================= */

            async function loadGameData() {

                if (
                    !landmarksLayer
                ) {

                    throw new Error(
                        "landmarksLayer nav pieejams."
                    );
                }

                console.log(
                    "[DATA] Querying landmarks..."
                );

                const query =
                    landmarksLayer.createQuery();

                query.where =
                    "1=1";

                query.outFields =
                    ["*"];

                query.returnGeometry =
                    true;

                const featureSet =
                    await landmarksLayer.queryFeatures(
                        query
                    );

                console.log(
                    "[DATA] FeatureSet received:",
                    featureSet
                );

                const landmarks =
                    (
                        featureSet.features ||
                        []
                    ).filter(
                        (feature) =>
                            feature.geometry
                    );

                landmarks.forEach(
                    (feature) => {

                        const photoUrl =
                            feature
                                .attributes
                                .Photo;

                        feature.attributes.imageUrl =
                            photoUrl
                                ? String(
                                      photoUrl
                                  ).trim()
                                : null;
                    }
                );

                landmarkPool =
                    landmarks;

                allLandmarks =
                    landmarks.slice();

                console.log(
                    "[DATA] Landmarks:",
                    landmarkPool.length
                );

                return landmarks;
            }

            /* =================================================================
             * GAME
             * ================================================================= */

            function shuffleArray(
                array
            ) {

                for (
                    let i =
                        array.length - 1;
                    i > 0;
                    i--
                ) {

                    const j =
                        Math.floor(
                            Math.random() *
                                (i + 1)
                        );

                    [
                        array[i],
                        array[j],
                    ] = [
                        array[j],
                        array[i],
                    ];
                }

                return array;
            }

            function startGame() {

                currentLandmarkIndex =
                    0;

                totalScore =
                    0;

                accuracyTracker =
                    [];

                clickedPoint =
                    null;

                if (
                    mapEl.graphics
                ) {
                    mapEl.graphics.removeAll();
                }

                allLandmarks =
                    CONFIG.shuffleLandmarks
                        ? shuffleArray(
                              landmarkPool.slice()
                          )
                        : landmarkPool.slice();

                if (
                    CONFIG.roundsPerGame
                ) {

                    allLandmarks =
                        allLandmarks.slice(
                            0,
                            CONFIG.roundsPerGame
                        );
                }

                if (
                    !allLandmarks.length
                ) {

                    alert(
                        "Nav pieejamu vietu spēlei."
                    );

                    return;
                }

                startRound();
            }

            function startRound() {

                clickedPoint =
                    null;

                if (
                    mapEl.graphics
                ) {
                    mapEl.graphics.removeAll();
                }

                const landmark =
                    allLandmarks[
                        currentLandmarkIndex
                    ];

                const name =
                    getLandmarkName(
                        landmark
                    );

                const imageUrl =
                    getLandmarkPhoto(
                        landmark
                    );

                if (
                    $("landmark-name")
                ) {

                    $("landmark-name").innerText =
                        name;
                }

                if (
                    imageUrl &&
                    imageElements.container &&
                    imageElements.image
                ) {

                    imageElements.container.classList.remove(
                        "hidden"
                    );

                    imageElements.image.classList.add(
                        "hidden"
                    );

                    if (
                        imageElements.spinner
                    ) {

                        imageElements.spinner.classList.remove(
                            "hidden"
                        );
                    }

                    imageElements.image.onload =
                        () => {

                            imageElements.image.classList.remove(
                                "hidden"
                            );

                            if (
                                imageElements.spinner
                            ) {

                                imageElements.spinner.classList.add(
                                    "hidden"
                                );
                            }
                        };

                    imageElements.image.onerror =
                        () => {

                            imageElements.container.classList.add(
                                "hidden"
                            );

                            if (
                                imageElements.spinner
                            ) {

                                imageElements.spinner.classList.add(
                                    "hidden"
                                );
                            }
                        };

                    imageElements.image.src =
                        imageUrl;

                    imageElements.image.alt =
                        name;

                } else {

                    if (
                        imageElements.container
                    ) {

                        imageElements.container.classList.add(
                            "hidden"
                        );
                    }
                }

                gameState =
                    "PLAYING";

                clicksEnabled =
                    true;

                updateUI();
            }

            function handleMapClick(
                mapPoint
            ) {

                if (
                    !clicksEnabled
                ) {
                    return;
                }

                clickedPoint =
                    mapPoint;

                if (
                    mapEl.graphics
                ) {
                    mapEl.graphics.removeAll();
                }

                const pinGraphic =
                    new Graphic({
                        geometry:
                            clickedPoint,
                        symbol:
                            makePinSymbol(
                                PIN_REST_YOFFSET
                            ),
                    });

                mapEl.graphics.add(
                    pinGraphic
                );

                updateUI();
            }

            function confirmGuess() {

                if (
                    !clickedPoint
                ) {
                    return;
                }

                clicksEnabled =
                    false;

                const target =
                    allLandmarks[
                        currentLandmarkIndex
                    ];

                const targetGeometry =
                    getTargetGeometry(
                        target
                    );

                const scoring =
                    CONFIG.scoring ||
                    {
                        pointsForHit:
                            10,
                        bucketMeters:
                            500,
                        penaltyPerBucket:
                            1,
                        minScore:
                            0,
                    };

                const distance =
                    getDistanceMeters(
                        targetGeometry,
                        clickedPoint
                    );

                const hit =
                    isDirectHit(
                        targetGeometry,
                        clickedPoint
                    );

                let roundScore;

                if (hit) {

                    roundScore =
                        scoring.pointsForHit;

                } else {

                    const bands =
                        Math.floor(
                            distance /
                                scoring.bucketMeters
                        );

                    const penalty =
                        bands *
                        scoring.penaltyPerBucket;

                    roundScore =
                        Math.max(
                            scoring.minScore,
                            scoring.pointsForHit -
                                penalty
                        );
                }

                const fullPoints =
                    roundScore ===
                    scoring.pointsForHit;

                totalScore +=
                    roundScore;

                accuracyTracker.push(
                    fullPoints
                        ? 1
                        : 0
                );

                if (
                    $("round-result-title")
                ) {

                    $("round-result-title").innerText =
                        fullPoints
                            ? t(
                                  "correctTitle"
                              )
                            : t(
                                  "incorrectTitle"
                              );

                    $("round-result-title").style.color =
                        fullPoints
                            ? "#16a34a"
                            : "#dc2626";
                }

                if (
                    $("round-result-message")
                ) {

                    $("round-result-message").innerHTML =
                        fullPoints
                            ? t(
                                  "correctMessage",
                                  {
                                      roundScore:
                                          roundScore,
                                  }
                              )
                            : t(
                                  "incorrectMessage",
                                  {
                                      distance:
                                          Math.round(
                                              distance
                                          ),
                                      roundScore:
                                          roundScore,
                                  }
                              );
                }

                if (
                    targetGeometry
                ) {

                    const answerGraphic =
                        new Graphic({
                            geometry:
                                targetGeometry,
                            symbol:
                                fullPoints
                                    ? correctAreaSymbol
                                    : incorrectAreaSymbol,
                        });

                    mapEl.graphics.add(
                        answerGraphic
                    );
                }

                if (
                    targetGeometry
                ) {

                    let target =
                        targetGeometry;

                    if (
                        targetGeometry.extent
                    ) {

                        target =
                            targetGeometry.extent.expand(
                                1.8
                            );
                    }

                    mapEl
                        .goTo(target)
                        .catch(
                            () => {}
                        );
                }

                gameState =
                    "ROUND_RESULT";

                updateUI();
            }

            function nextRound() {

                currentLandmarkIndex++;

                if (
                    currentLandmarkIndex <
                    allLandmarks.length
                ) {

                    startRound();

                } else {

                    endGame();
                }
            }

            function endGame() {

                gameState =
                    "GAME_OVER";

                clicksEnabled =
                    false;

                const total =
                    allLandmarks.length ||
                    1;

                const found =
                    accuracyTracker.filter(
                        (x) =>
                            x === 1
                    ).length;

                const accuracy =
                    Math.round(
                        (found /
                            total) *
                            100
                    );

                if (
                    $("total-score")
                ) {

                    $("total-score").innerText =
                        totalScore;
                }

                if (
                    $("accuracy")
                ) {

                    $("accuracy").innerText =
                        `${accuracy}%`;
                }

                if (
                    $("found-count")
                ) {

                    $("found-count").innerText =
                        `${found} / ${allLandmarks.length}`;
                }

                updateUI();
            }

            /* =================================================================
             * EVENTS
             * ================================================================= */

            if (
                mapEl
            ) {

                mapEl.addEventListener(
                    "arcgisViewClick",
                    (event) => {

                        if (
                            clicksEnabled &&
                            event.detail &&
                            event.detail.mapPoint
                        ) {

                            handleMapClick(
                                event.detail.mapPoint
                            );
                        }
                    }
                );
            }

            if (
                buttons.start
            ) {

                buttons.start.addEventListener(
                    "click",
                    startGame
                );
            }

            if (
                buttons.confirm
            ) {

                buttons.confirm.addEventListener(
                    "click",
                    confirmGuess
                );
            }

            if (
                buttons.next
            ) {

                buttons.next.addEventListener(
                    "click",
                    nextRound
                );
            }

            if (
                buttons.playAgain
            ) {

                buttons.playAgain.addEventListener(
                    "click",
                    startGame
                );
            }

            if (
                buttons.langToggle
            ) {

                buttons.langToggle.addEventListener(
                    "click",
                    () => {

                        if (
                            LANGUAGES.length <
                            2
                        ) {
                            return;
                        }

                        const index =
                            LANGUAGES.findIndex(
                                (
                                    lang
                                ) =>
                                    lang.code ===
                                    currentLanguage
                            );

                        currentLanguage =
                            LANGUAGES[
                                (
                                    index +
                                    1
                                ) %
                                    LANGUAGES.length
                            ].code;

                        updateUI();
                    }
                );
            }

            /* =================================================================
             * START
             * ================================================================= */

            updateUI();

            init();

        }
    )
    .catch(
        (error) => {

            console.error(
                "ArcGIGuess fatal error:",
                error
            );

            alert(
                "ArcGIGuess JavaScript ielāde neizdevās. Atver F12 → Console."
            );
        }
    );
