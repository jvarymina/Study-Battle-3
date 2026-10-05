import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBNIafQGQlbKwXFVCaQvws1JsAZyfUL3jc",
    authDomain: "study-battle-f7f71.firebaseapp.com",
    databaseURL: "https://study-battle-f7f71-default-rtdb.firebaseio.com",
    projectId: "study-battle-f7f71",
    storageBucket: "study-battle-f7f71.firebasestorage.app",
    messagingSenderId: "265815989135",
    appId: "1:265815989135:web:3387d6c22b85c01aee89fa",
    measurementId: "G-Y6DXWYWEYL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
