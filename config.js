/* =============================================================================
 * ArcGIGuess — Configuration
 * =============================================================================
 * Pazudusī Latvija — Atrodi vietu kartē
 * ========================================================================== */

window.ARCGIGUESS_CONFIG = {
    /* -------------------------------------------------------------------------
     * 1. BRANDING
     * ---------------------------------------------------------------------- */

    appName: "Pazudusī Latvija: Atrodi vietu kartē",

    tagline: "Pārbaudi savas zināšanas",

    shareCardFooter: null,

    /* -------------------------------------------------------------------------
     * 2. THE MAP & LANDMARK DATA
     * ---------------------------------------------------------------------- */

    // ArcGIS Online
    portalUrl: null,

    // Tava ArcGIS Web Map
    webMapItemId: "c61a0c96c36a4397aa8542fce258a4b4",

    // Slāņa nosaukums Web Map
    landmarkLayerTitle: "Vietas",

    // Tavā slānī ID lauks ir FID
    landmarkIdField: "FID",

    // Foto URL atrodas laukā Photo
    landmarkPhotoField: "Photo",

    // null = izmantot visas vietas
    roundsPerGame: null,

    // Nejauša vietu secība
    shuffleLandmarks: true,

    // Atļaut pabeigt spēli ātrāk
    allowFinishEarly: true,

    /* -------------------------------------------------------------------------
     * 3. SCORING
     * ---------------------------------------------------------------------- */

    scoring: {
        // Maksimālais punktu skaits par vietu
        pointsForHit: 10,

        // Attāluma josla metros
        bucketMeters: 500,

        // Par katriem 500 m nost -1 punkts
        penaltyPerBucket: 1,

        // Minimālais punktu skaits par kārtu
        minScore: 0,
    },

    /* -------------------------------------------------------------------------
     * 4. LANGUAGES
     * ---------------------------------------------------------------------- */

    languages: [
        {
            code: "lv",

            dir: "ltr",

            // Lauks ArcGIS slānī ar vietas nosaukumu
            landmarkNameField: "Name",

            surveyLang: null,

            strings: {
                /* START SCREEN */

                welcomeTitle:
                    "Laipni lūdzam “Pazudusī Latvija”!",

                welcomeDesc:
                    "Atrodi vietu. Atceries vēsturi. Pārbaudi sevi! Mēs parādīsim vēsturiskas vietas nosaukumu un attēlu. Vai vari to atrast kartē?<br><br>{scoringSummary}",

                scoringSummaryTemplate:
                    "Atrodi vietu vai nokļūsti {bucket} m attālumā: <strong>+{points} punkti</strong><br><strong>-{penalty} punkts</strong> par katriem {bucket} m no pareizās vietas, līdz pat {min} punktiem.",

                startButton:
                    "Sākt spēli",

                /* LOADING */

                loadingText:
                    "Vietu ielādēšana...",

                /* GAME */

                findLandmarkText:
                    "Atrodi šo vietu:",

                scoreDisplay:
                    "Punkti: {score}",

                roundDisplay:
                    "Kārta {current} no {total}",

                confirmButton:
                    "Apstiprināt minējumu",

                /* ROUND RESULT */

                correctTitle:
                    "Pareizi!",

                correctMessage:
                    "Ideāli! Tu nopelnīji <strong>+{roundScore} punktus</strong>.",

                incorrectTitle:
                    "Tik tuvu!",

                incorrectMessage:
                    "Tu biji <strong>{distance} m</strong> prom no pareizās vietas. Tu nopelnīji <strong>{roundScore} punktus</strong>. Šeit ir pareizā lokācija.",

                nextButton:
                    "Nākamā vieta",

                finishEarlyButton:
                    "Pabeigt ātrāk",

                finishEarlyConfirm:
                    "Nospied vēlreiz, lai noslēgtu spēli",

                gameOverButton:
                    "Rezultāti",

                /* GAME OVER */

                gameOverTitle:
                    "Spēle beidzās!",

                finalScoreText:
                    "Lūk, tavi rezultāti:",

                totalScoreLabel:
                    "Kopējais punktu skaits",

                accuracyLabel:
                    "Precizitāte",

                foundLabel:
                    "Vietas atrastas",

                playAgainButton:
                    "Spēlēt vēlreiz",

                shareButton:
                    "Dalīties ar rezultātiem",

                /* SHARING */

                shareText:
                    "Es nopelnīju {score} punktus spēlē {appName}! Cik vietas tu vari atrast? Spēlē: {url}",

                shareCardTitle:
                    "Mans {appName} rezultāts!",

                shareCardScoreLabel:
                    "Kopējie punkti",

                shareCardAccuracyLabel:
                    "Precizitāte",

                shareModalTitle:
                    "Dalīties ar rezultātiem!",

                shareModalDesc:
                    "Ar labo peles pogu noklikšķini uz attēla vai turi to nospiestu, lai to saglabātu un kopīgotu.",

                /* ERRORS */

                webMapError:
                    "Neizdevās ielādēt karti. Lūdzu, pārbaudi ArcGIS Web Map ID.",

                layerError:
                    "Tīmekļa kartē neizdevās atrast slāni “Vietas”. Pārbaudi slāņa nosaukumu config.js failā.",

                /* LEADERBOARD */

                submitScoreButton:
                    "Iesniegt rezultātu",

                viewLeaderboardButton:
                    "Rezultātu tabula",

                submitModalTitle:
                    "Iesniegt rezultātu",

                leaderboardModalTitle:
                    "Labākie spēlētāji",

                leaderboardLoadingText:
                    "Notiek rezultātu tabulas ielāde...",

                leaderboardError:
                    "Neizdevās ielādēt labāko rezultātu datus. Lūdzu, mēģini vēlreiz vēlāk.",

                noScores:
                    "Pagaidām nav iesniegts neviens rezultāts.",

                points:
                    "punkti",
            },
        },
    ],

    /* -------------------------------------------------------------------------
     * 5. SOCIAL SHARING
     * ---------------------------------------------------------------------- */

    social: {
        title:
            "Pazudusī Latvija: Atrodi vietu kartē",

        description:
            "Atrodi vietu. Atceries vēsturi. Pārbaudi sevi! Mēs parādīsim vēsturiskas vietas nosaukumu un attēlu.",

        image:
            "https://aelhussiny.github.io/ArcGIGuess/assets/screenshot.png",

        url:
            "https://aelhussiny.github.io/ArcGIGuess",

        twitterHandle:
            "",
    },

    /* -------------------------------------------------------------------------
     * 6. LEADERBOARD
     * ---------------------------------------------------------------------- */

    leaderboard: {
        enabled: false,

        survey123Url:
            "https://survey123.arcgis.com/share/c4317eb262934df4b2fe38cb42a3d1d1",

        submitScoreFieldId:
            "field:score",

        dataApiUrl:
            "https://services1.arcgis.com/zu8dBGfmKCvrZHh2/arcgis/rest/services/survey123_c4317eb262934df4b2fe38cb42a3d1d1_results/FeatureServer/0/query",

        firstNameField:
            "first_name",

        lastNameField:
            "last_name",

        scoreField:
            "score",

        topN:
            10,
    },
};
