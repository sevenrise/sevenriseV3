// ==========================================
// SEVENRISE V3 - MAIN APPLICATION
// ==========================================

let currentUser = null;
let miningInterval = null;
let miningEndsAt = null;

// ELEMENTS
const authSection = document.getElementById("auth-section");
const dashboardSection = document.getElementById("dashboard-section");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const loginBtn = document.getElementById("login-btn");
const registerBtn = document.getElementById("register-btn");
const logoutBtn = document.getElementById("logout-btn");

const authMessage = document.getElementById("auth-message");
const miningMessage = document.getElementById("mining-message");
const referralMessage = document.getElementById("referral-message");


// ==========================================
// MESSAGE
// ==========================================

function showMessage(element, message) {
    if (element) element.textContent = message;
}


// ==========================================
// AUTHENTICATION
// ==========================================

async function register() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showMessage(authMessage, "Masukkan email dan password.");
        return;
    }

    if (password.length < 6) {
        showMessage(authMessage, "Password minimal 6 karakter.");
        return;
    }

    registerBtn.disabled = true;
    showMessage(authMessage, "Mendaftarkan akun...");

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password
        });

        if (error) throw error;

        if (data.session) {
            showMessage(authMessage, "Registrasi berhasil!");
            await loadApplication();
        } else {
            showMessage(
                authMessage,
                "Registrasi berhasil. Periksa email untuk konfirmasi akun."
            );
        }

    } catch (error) {
        showMessage(authMessage, error.message);
    } finally {
        registerBtn.disabled = false;
    }
}


async function login() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showMessage(authMessage, "Masukkan email dan password.");
        return;
    }

    loginBtn.disabled = true;
    showMessage(authMessage, "Sedang login...");

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        showMessage(authMessage, "Login berhasil!");
        await loadApplication();

    } catch (error) {
        showMessage(authMessage, error.message);
    } finally {
        loginBtn.disabled = false;
    }
}


async function logout() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        alert(error.message);
        return;
    }

    stopMiningTimer();

    currentUser = null;
    dashboardSection.hidden = true;
    authSection.hidden = false;

    showMessage(authMessage, "Kamu sudah logout.");
}


// ==========================================
// LOAD APPLICATION
// ==========================================

async function loadApplication() {
    const {
        data: { session },
        error
    } = await supabaseClient.auth.getSession();

    if (error) {
        showMessage(authMessage, error.message);
        return;
    }

    if (!session) {
        currentUser = null;
        dashboardSection.hidden = true;
        authSection.hidden = false;
        stopMiningTimer();
        return;
    }

    currentUser = session.user;

    authSection.hidden = true;
    dashboardSection.hidden = false;

    document.getElementById("user-email").textContent =
        currentUser.email || "SevenRise Member";

    await loadDashboard();
}


// ==========================================
// DASHBOARD
// ==========================================

async function loadDashboard() {
    try {
        const { data, error } = await supabaseClient.rpc(
            "svr_get_dashboard"
        );

        if (error) throw error;

        if (!data) throw new Error("Dashboard tidak mengembalikan data.");

        const dashboard = Array.isArray(data) ? data[0] : data;

        document.getElementById("balance").textContent =
            Number(dashboard.balance || 0).toLocaleString("en-US");

        document.getElementById("referral-code").textContent =
            dashboard.referral_code || "Unavailable";

        document.getElementById("referral-count").textContent =
            Number(dashboard.referral_count || 0);

        document.getElementById("referral-earnings").textContent =
            Number(dashboard.referral_earnings || 0).toLocaleString("en-US");

        const miningStart =
            dashboard.mining_started_at ||
            dashboard.started_at;

        const miningEnd =
            dashboard.mining_ends_at ||
            dashboard.ends_at;

        const miningClaimed =
            dashboard.mining_claimed_at ||
            dashboard.claimed_at;

        const startButton = document.getElementById("start-mining-btn");
        const claimButton = document.getElementById("claim-mining-btn");

        if (miningEnd && !miningClaimed) {
            miningEndsAt = new Date(miningEnd);

            startButton.disabled = true;
            claimButton.disabled = false;

            updateMiningTimer();

        } else {
            miningEndsAt = null;
            stopMiningTimer();

            document.getElementById("mining-timer").textContent =
                "24:00:00";

            document.getElementById("mining-status").textContent =
                "Mining is not active.";

            startButton.disabled = false;
            claimButton.disabled = true;
        }

    } catch (error) {
        console.error("Dashboard error:", error);
        showMessage(miningMessage, error.message);
    }
}


// ==========================================
// START MINING
// ==========================================

async function startMining() {
    const button = document.getElementById("start-mining-btn");

    button.disabled = true;
    showMessage(miningMessage, "Memulai mining...");

    try {
        const { data, error } = await supabaseClient.rpc(
            "svr_start_mining"
        );

        if (error) throw error;

        showMessage(miningMessage, "Mining berhasil dimulai!");

        await loadDashboard();

    } catch (error) {
        showMessage(miningMessage, error.message);
        button.disabled = false;
    }
}


// ==========================================
// MINING COUNTDOWN
// ==========================================

function updateMiningTimer() {
    stopMiningTimer();

    if (!miningEndsAt) return;

    function tick() {
        const remaining = Math.max(
            0,
            Math.floor((miningEndsAt.getTime() - Date.now()) / 1000)
        );

        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;

        document.getElementById("mining-timer").textContent =
            [hours, minutes, seconds]
                .map(value => String(value).padStart(2, "0"))
                .join(":");

        if (remaining <= 0) {
            document.getElementById("mining-status").textContent =
                "Mining completed. You can claim your reward.";

            document.getElementById("claim-mining-btn").disabled = false;

            stopMiningTimer();
        } else {
            document.getElementById("mining-status").textContent =
                "Mining in progress...";
        }
    }

    tick();
    miningInterval = setInterval(tick, 1000);
}


function stopMiningTimer() {
    if (miningInterval) {
        clearInterval(miningInterval);
        miningInterval = null;
    }
}


// ==========================================
// CLAIM MINING REWARD
// ==========================================

async function claimMining() {
    const button = document.getElementById("claim-mining-btn");

    button.disabled = true;
    showMessage(miningMessage, "Memproses reward...");

    try {
        const { data, error } = await supabaseClient.rpc(
            "svr_claim_mining"
        );

        if (error) throw error;

        showMessage(miningMessage, "Reward berhasil diklaim!");

        miningEndsAt = null;
        stopMiningTimer();

        await loadDashboard();

    } catch (error) {
        showMessage(miningMessage, error.message);
        button.disabled = false;
    }
}


// ==========================================
// REFERRAL
// ==========================================

async function applyReferral() {
    const input = document.getElementById("input-referral-code");
    const code = input.value.trim();

    if (!code) {
        showMessage(referralMessage, "Masukkan referral code.");
        return;
    }

    const button = document.getElementById("apply-referral-btn");

    button.disabled = true;
    showMessage(referralMessage, "Memproses referral...");

    try {
        const { data, error } = await supabaseClient.rpc(
            "svr_apply_referral",
            {
                input_code: code
            }
        );

        if (error) throw error;

        showMessage(referralMessage, "Referral berhasil digunakan!");

        input.value = "";

        await loadDashboard();

    } catch (error) {
        showMessage(referralMessage, error.message);
    } finally {
        button.disabled = false;
    }
}


// ==========================================
// COPY REFERRAL CODE
// ==========================================

async function copyReferral() {
    const code = document.getElementById("referral-code").textContent;

    if (!code || code === "Loading..." || code === "Unavailable") {
        return;
    }

    try {
        await navigator.clipboard.writeText(code);
        showMessage(referralMessage, "Referral code berhasil disalin!");
    } catch (error) {
        showMessage(referralMessage, "Gagal menyalin kode.");
    }
}


// ==========================================
// BUTTON EVENTS
// ==========================================

loginBtn.addEventListener("click", login);

registerBtn.addEventListener("click", register);

logoutBtn.addEventListener("click", logout);

document.getElementById("start-mining-btn")
    .addEventListener("click", startMining);

document.getElementById("claim-mining-btn")
    .addEventListener("click", claimMining);

document.getElementById("apply-referral-btn")
    .addEventListener("click", applyReferral);

document.getElementById("copy-referral-btn")
    .addEventListener("click", copyReferral);


// ==========================================
// AUTH SESSION LISTENER
// ==========================================

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
        loadApplication();
    }
});


// ==========================================
// START APPLICATION
// ==========================================

loadApplication();
