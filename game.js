const cars = [
    document.getElementById("m1"),
    document.getElementById("m2"),
    document.getElementById("m3"),
    document.getElementById("m4"),
    document.getElementById("m5")
];

const players = [
    { name: "Alex", car: 0 },
    { name: "Liam", car: 1 },
    { name: "Emma", car: 2 },
    { name: "Noah", car: 3 },
    { name: "Mia", car: 4 }
];

const positions = [18, 18, 18, 18, 18];
let speeds = [0.011, 0.011, 0.011, 0.011, 0.011];

let progress = [0, 0, 0, 0, 0];
let raceRunning = false;
let winnerDeclared = false;
    cars.forEach(car => delete car.dataset.finished);
let raceTimer = null;

const countdownText = document.getElementById("countdownText");
const goOverlay = document.getElementById("goOverlay");
const winnerPopup = document.getElementById("winnerPopup");
const winnerName = document.getElementById("winnerName");

function placeCars() {
    cars.forEach((car, index) => {
        const startX = [46, 53, 60, 67, 74][index];

        car.style.left = `${startX}%`;
        car.style.top = `${positions[index]}%`;

        // Mobil asli dibuat menghadap ke bawah.
        car.style.transform = "rotate(180deg)";
    });
}

function showCountdown(number) {
    countdownText.innerText = number;
    countdownText.classList.remove("show");

    void countdownText.offsetWidth;

    countdownText.classList.add("show");
}

function showGO() {
    goOverlay.classList.remove("show");

    void goOverlay.offsetWidth;

    goOverlay.classList.add("show");
}

function startCountdown() {
    const sequence = ["3", "2", "1"];
    let index = 0;

    showCountdown(sequence[index]);

    const timer = setInterval(() => {
        index++;

        if (index < sequence.length) {
            showCountdown(sequence[index]);
        } else {
            clearInterval(timer);

            countdownText.innerText = "";

            showGO();

            setTimeout(() => {
                startRace();
            }, 450);
        }
    }, 850);
}

function startRace() {
    raceRunning = true;
    winnerDeclared = false;
    cars.forEach(car => delete car.dataset.finished);
    speeds = players.map(() => 0.006 + Math.random() * 0.002);

    progress = [0, 0, 0, 0, 0];

    if (raceTimer) {
        cancelAnimationFrame(raceTimer);
    }

    raceLoop();
}

function raceLoop() {
    if (!raceRunning) return;

    let winner = -1;

    cars.forEach((car, index) => {
        progress[index] += speeds[index];

        // Pertama kali melewati garis finish = pemenang
        if (progress[index] >= 1 && !car.dataset.finished) {
            car.dataset.finished = "true";

            if (winner === -1) {
                winner = index;
            }
        }

        // Mobil tetap melaju melewati garis finish
        const startY = positions[index];
        const finishY = 86;

        const y =
            startY +
            (finishY - startY) * progress[index];

        car.style.top = `${y}%`;

        // Tetap di jalur masing-masing
        const baseX = [46, 53, 60, 67, 74][index];
        car.style.left = `${baseX}%`;

        // Menghadap ke bawah
        car.style.transform = "rotate(180deg)";
    });

    updateRanking();

    // Tentukan pemenang, tetapi JANGAN menghentikan race
    if (winner !== -1 && !winnerDeclared) {
        winnerDeclared = true;
        finishRace(winner);
    }

    // Mobil terus bergerak sampai jauh melewati layar
    if (progress.some(p => p < 1.35)) {
        raceTimer = requestAnimationFrame(raceLoop);
    } else {
        raceRunning = false;
        raceTimer = null;

        setTimeout(() => {
            resetRace();

            setTimeout(() => {
                startCountdown();
            }, 1200);
        }, 500);
    }
}

function updateRanking() {
    const ranking = players
        .map((player, index) => ({
            ...player,
            progress: progress[index]
        }))
        .sort((a, b) => b.progress - a.progress);

    ranking.forEach((player, rank) => {
        const row = document.getElementById(`rank${rank + 1}`);

        if (!row) return;

        const number = row.querySelector(".rank-number");
        const name = row.querySelector(".rank-name");

        if (number) {
            number.innerText = rank + 1;
        }

        if (name) {
            name.innerText = player.name;
        }
    });
}

function finishRace(winnerIndex) {
    const winner = players[winnerIndex];

    winnerName.innerText = winner.name;
    winnerPopup.classList.remove("show");

    void winnerPopup.offsetWidth;
    winnerPopup.classList.add("show");

    /*
     * Pemenang sudah ditentukan, tetapi race tetap berjalan.
     * Mobil terus melaju sampai keluar layar.
     */
    setTimeout(() => {
        winnerPopup.classList.remove("show");
    }, 3000);
}

function resetRace() {
    progress = [0, 0, 0, 0, 0];

    placeCars();

    updateRanking();
}

/* =========================================
   INITIALIZE
========================================= */

placeCars();
updateRanking();

/*
 * Prototype lokal:
 * otomatis mulai.
 */
setTimeout(() => {
    startCountdown();
}, 1000);
