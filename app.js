import { auth, db } from "./firebase-config.js";
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
    collection,
    addDoc,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    orderBy,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const loginAccounts = {
    "Jvary Mina": "jvary@gmail.com",
    "Bemen_Fady": "bebo@gmail.com"
};

let currentUser = null;
let currentMode = "student";
let cameraStream = null;
let facingMode = "environment";
let currentTaskForCamera = null;

const $ = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
    const status = $("loginStatus");
    status.textContent = message;
    status.style.color = isError ? "#d63031" : "#666";
}

function showDashboard() {
    $("loginPage").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
}

function showLogin() {
    $("dashboard").classList.add("hidden");
    $("loginPage").classList.remove("hidden");
}

async function login() {
    const username = $("username").value.trim();
    const password = $("password").value;
    const selectedRole = $("role").value;
    const email = loginAccounts[username];

    if (!username || !password) {
        setStatus("Please enter username and password.", true);
        return;
    }

    if (!email) {
        setStatus("Username not found.", true);
        return;
    }

    const button = $("loginButton");
    button.disabled = true;
    setStatus("Logging in...");

    try {
        const credential = await signInWithEmailAndPassword(
            auth,
            email,
            password
        );
        const userRef = doc(db, "users", credential.user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};

        currentUser = {
            uid: credential.user.uid,
            email: credential.user.email,
            username,
            name: userData.name || username,
            points: Number(userData.points) || 0,
            role: userData.role || selectedRole
        };

        currentMode =
            username === "Jvary Mina"
                ? selectedRole
                : userData.role || "student";

        updateUI();
        await loadPoints();
        await loadTasks();
    } catch (error) {
        console.error(error);
        setStatus(
            "Login failed. Check your username/password and Firebase settings.",
            true
        );
    } finally {
        button.disabled = false;
    }
}

async function logout() {
    try {
        closeCamera(false);
        await signOut(auth);
        currentUser = null;
        currentMode = "student";
        showLogin();
        setStatus("");
        $("password").value = "";
    } catch (error) {
        console.error(error);
    }
}

function updateUI() {
    if (!currentUser) return;

    showDashboard();
    $("welcomeMessage").textContent = `Welcome, ${currentUser.name}!`;
    updateModeButtons();
}

function updateModeButtons() {
    const addTaskButton = $("addTaskButton");
    addTaskButton.classList.toggle("hidden", currentMode !== "admin");

    let modeButton = $("modeButton");

    if (!modeButton && currentUser?.username === "Jvary Mina") {
        modeButton = document.createElement("button");
        modeButton.type = "button";
        modeButton.id = "modeButton";
        $("logoutButton").before(modeButton);
    }

    if (modeButton) {
        modeButton.textContent =
            currentMode === "admin"
                ? "👨‍🎓 Student Mode"
                : "👑 Admin Mode";
        modeButton.onclick = () => {
            currentMode = currentMode === "admin" ? "student" : "admin";
            updateModeButtons();
            loadTasks();
        };
    }
}

async function loadPoints() {
    if (!currentUser) return;

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        let friend = null;

        usersSnap.forEach((item) => {
            if (item.id === currentUser.uid) {
                currentUser.points = Number(item.data().points) || 0;
                currentUser.name = item.data().name || currentUser.name;
            } else if (!friend) {
                friend = { ...item.data(), uid: item.id };
            }
        });

        $("myLabel").textContent = `👤 ${currentUser.name}`;
        $("myPoints").textContent = currentUser.points;
        $("friendLabel").textContent = friend
            ? `🏆 ${friend.name || "Friend"}`
            : "🏆 Friend";
        $("friendPoints").textContent = friend
            ? Number(friend.points) || 0
            : 0;
    } catch (error) {
        console.error("loadPoints", error);
    }
}

async function loadTasks() {
    if (!currentUser) return;

    const container = $("tasksContainer");
    container.innerHTML = `<div class="empty-state">Loading tasks...</div>`;

    try {
        const tasksSnap = await getDocs(
            query(collection(db, "tasks"), orderBy("createdAt", "desc"))
        );
        const submissionsSnap = await getDocs(collection(db, "submissions"));
        const submissions = {};

        submissionsSnap.forEach((item) => {
            const data = item.data();
            if (data.userId === currentUser.uid) {
                submissions[data.taskId] = { id: item.id, ...data };
            }
        });

        if (tasksSnap.empty) {
            container.innerHTML = `<div class="empty-state">No tasks yet.</div>`;
            return;
        }

        container.innerHTML = "";
        tasksSnap.forEach((item) => {
            renderTask(item.id, item.data(), submissions[item.id]);
        });
    } catch (error) {
        console.error("loadTasks", error);
        container.innerHTML =
            `<div class="empty-state">Could not load tasks. Check Firestore rules.</div>`;
    }
}

function renderTask(taskId, task, submission) {
    const container = $("tasksContainer");
    const taskElement = document.createElement("div");
    taskElement.className = "task";

    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = task.name || "Untitled task";
    const description = document.createElement("p");
    description.textContent =
        task.description || "Complete this task and submit proof.";
    info.append(title, description);

    const right = document.createElement("div");
    right.className = "task-actions";

    const points = document.createElement("span");
    points.className = "task-points";
    points.textContent = `${Number(task.points) || 0} pts`;
    right.appendChild(points);

    if (currentMode === "admin") {
        if (submission && !submission.approved) {
            const approve = document.createElement("button");
            approve.type = "button";
            approve.className = "approve-btn";
            approve.textContent = "✅ Approve";
            approve.addEventListener("click", () =>
                approveSubmission(submission.id, taskId, task.points)
            );
            right.appendChild(approve);
        }

        const del = document.createElement("button");
        del.type = "button";
        del.className = "delete-btn";
        del.textContent = "🗑 Delete";
        del.addEventListener("click", () => deleteTask(taskId));
        right.appendChild(del);
    } else {
        const action = document.createElement("button");
        action.type = "button";

        if (!submission) {
            action.textContent = "📸 Submit Proof";
            action.addEventListener("click", () => openProofOptions(taskId));
        } else if (submission.approved) {
            action.textContent = "✅ Approved";
            action.disabled = true;
        } else {
            action.textContent = "⏳ Pending Approval";
            action.disabled = true;
        }

        right.appendChild(action);
    }

    taskElement.append(info, right);
    container.appendChild(taskElement);
}

function showAddTask() {
    if (currentMode !== "admin") return;
    $("addTaskBox").classList.remove("hidden");
    $("taskName").focus();
}

function hideAddTask() {
    $("addTaskBox").classList.add("hidden");
    $("taskName").value = "";
    $("taskPoints").value = "";
}

async function addTask() {
    const name = $("taskName").value.trim();
    const points = Number($("taskPoints").value);

    if (!name || !Number.isFinite(points) || points <= 0) {
        alert("Enter a task name and valid points.");
        return;
    }

    const button = $("addTaskConfirmButton");
    button.disabled = true;

    try {
        await addDoc(collection(db, "tasks"), {
            name,
            points,
            createdAt: serverTimestamp(),
            createdBy: currentUser.uid
        });
        hideAddTask();
        await loadTasks();
    } catch (error) {
        console.error(error);
        alert("Could not add task. Check Firestore permissions.");
    } finally {
        button.disabled = false;
    }
}

async function deleteTask(taskId) {
    if (!confirm("Delete this task?")) return;

    try {
        await deleteDoc(doc(db, "tasks", taskId));
        await loadTasks();
    } catch (error) {
        console.error(error);
        alert("Could not delete task.");
    }
}

function openProofOptions(taskId) {
    const useCamera = confirm(
        "Press OK to use the camera. Press Cancel to choose a photo from your gallery."
    );

    if (useCamera) openCamera(taskId);
    else chooseGallery(taskId);
}

function chooseGallery(taskId) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (file) await submitProof(taskId, file);
    });
    input.click();
}

async function openCamera(taskId) {
    currentTaskForCamera = taskId;
    $("cameraModal").classList.remove("hidden");

    try {
        await startCamera();
    } catch (error) {
        console.error(error);
        alert(
            "Camera could not be opened. Make sure the site uses HTTPS and camera permission is allowed."
        );
        closeCamera();
    }
}

async function startCamera() {
    stopCameraStream();

    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API is not available in this browser.");
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false
    });

    $("cameraVideo").srcObject = cameraStream;
}

function stopCameraStream() {
    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
    }

    $("cameraVideo").srcObject = null;
}

async function switchCamera() {
    if (!currentTaskForCamera) return;

    facingMode = facingMode === "environment" ? "user" : "environment";

    try {
        await startCamera();
    } catch (error) {
        console.error(error);
    }
}

async function takePhoto() {
    if (!cameraStream || !currentTaskForCamera) return;

    const video = $("cameraVideo");
    const canvas = $("cameraCanvas");
    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const maxWidth = 700;
    const scale = Math.min(1, maxWidth / sourceWidth);

    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const taskId = currentTaskForCamera;
    const blob = await canvasToSmallJpeg(canvas);

    closeCamera();
    await submitProof(taskId, blob);
}

function canvasToSmallJpeg(canvas) {
    return new Promise((resolve, reject) => {
        let quality = 0.65;
        let attempts = 0;

        const makeBlob = () => {
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error("Could not create image."));
                        return;
                    }

                    if (blob.size <= 450000 || attempts >= 6) {
                        resolve(blob);
                        return;
                    }

                    attempts += 1;
                    quality = Math.max(0.25, quality - 0.08);
                    makeBlob();
                },
                "image/jpeg",
                quality
            );
        };

        makeBlob();
    });
}

function closeCamera(clearTask = true) {
    stopCameraStream();
    $("cameraModal").classList.add("hidden");

    if (clearTask) currentTaskForCamera = null;
}

function compressImage(file, maxWidth = 700) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const img = new Image();

            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));

                const context = canvas.getContext("2d", { alpha: false });
                context.drawImage(
                    img,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                canvasToSmallJpeg(canvas)
                    .then((blob) => {
                        if (blob.size > 700000) {
                            reject(
                                new Error(
                                    "Image is still too large after compression."
                                )
                            );
                            return;
                        }

                        resolve(blob);
                    })
                    .catch(reject);
            };

            img.onerror = () =>
                reject(new Error("Could not read the selected image."));
            img.src = reader.result;
        };

        reader.onerror = () => reject(new Error("Could not read the image."));
        reader.readAsDataURL(file);
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () =>
            reject(new Error("Could not convert image."));
        reader.readAsDataURL(blob);
    });
}

async function submitProof(taskId, file) {
    if (!currentUser) {
        alert("You are not logged in.");
        return;
    }

    if (!file) {
        alert("No image selected.");
        return;
    }

    try {
        const compressedImage = await compressImage(file);
        console.log(
            "Compressed image size:",
            compressedImage.size,
            "bytes"
        );

        if (compressedImage.size > 700000) {
            throw new Error("Image is too large.");
        }

        const imageBase64 = await blobToBase64(compressedImage);

        await addDoc(collection(db, "submissions"), {
            taskId,
            userId: currentUser.uid,
            userName: currentUser.name,
            image: imageBase64,
            approved: false,
            createdAt: serverTimestamp()
        });

        alert("Proof submitted successfully! Waiting for admin approval.");
        await loadTasks();
    } catch (error) {
        console.error("Submit proof error:", error);

        if (error.code === "permission-denied") {
            alert(
                "Firestore permission denied.\n\n" +
                "Open Cloud Firestore → Rules and make sure your signed-in users are allowed to write."
            );
        } else if (
            error.message &&
            error.message.toLowerCase().includes("too large")
        ) {
            alert(
                "The image is still too large.\n\n" +
                "Try taking the photo again."
            );
        } else {
            alert(`Could not submit proof.\n\n${error.message || "Unknown error."}`);
        }
    }
}

async function approveSubmission(submissionId, taskId, taskPoints) {
    try {
        await runTransaction(db, async (transaction) => {
            const submissionRef = doc(db, "submissions", submissionId);
            const submissionSnap = await transaction.get(submissionRef);

            if (!submissionSnap.exists()) return;

            const submission = submissionSnap.data();
            if (submission.approved) return;

            const userRef = doc(db, "users", submission.userId);
            const userSnap = await transaction.get(userRef);
            const oldPoints = userSnap.exists()
                ? Number(userSnap.data().points) || 0
                : 0;

            transaction.update(submissionRef, {
                approved: true,
                approvedAt: serverTimestamp()
            });

            transaction.set(
                userRef,
                { points: oldPoints + (Number(taskPoints) || 0) },
                { merge: true }
            );
        });

        await loadPoints();
        await loadTasks();
    } catch (error) {
        console.error(error);
        alert("Could not approve submission. Check Firestore permissions.");
    }
}

function bindEvents() {
    $("loginButton").addEventListener("click", login);
    $("logoutButton").addEventListener("click", logout);
    $("addTaskButton").addEventListener("click", showAddTask);
    $("addTaskConfirmButton").addEventListener("click", addTask);
    $("cancelTaskButton").addEventListener("click", hideAddTask);
    $("takePhotoButton").addEventListener("click", takePhoto);
    $("switchCameraButton").addEventListener("click", switchCamera);
    $("closeCameraButton").addEventListener("click", closeCamera);

    $("password").addEventListener("keydown", (event) => {
        if (event.key === "Enter") login();
    });
}

bindEvents();

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        currentUser = null;
        showLogin();
        return;
    }

    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? snap.data() : {};
        const username =
            Object.keys(loginAccounts).find(
                (key) => loginAccounts[key] === user.email
            ) || user.email;

        currentUser = {
            uid: user.uid,
            email: user.email,
            username,
            name: data.name || username,
            points: Number(data.points) || 0,
            role: data.role || "student"
        };

        currentMode = currentUser.role === "admin" ? "admin" : "student";
        updateUI();
        await loadPoints();
        await loadTasks();
    } catch (error) {
        console.error(error);
        setStatus("Could not load your account data.", true);
    }
});
