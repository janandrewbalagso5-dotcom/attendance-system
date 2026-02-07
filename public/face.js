import { supabase } from "./supabase.js";

// DOM ELEMENTS
let video;
let registerBtn;
let attendanceBtn;

// GLOBAL STATE
let modelsLoaded = false;
let registeredUsers = [];

// FACE DETECTOR OPTIONS
const faceDetectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 224,
  scoreThreshold: 0.5,
});

//START CAMERA
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.error("Camera error:", err);
    alert("Cannot access camera.");
  }
}

// LOAD MODELS
async function loadModels() {
  try {
    const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    modelsLoaded = true;
    await loadRegisteredUsers();
    console.log("✅ Face-api models loaded");
  } catch (err) {
    console.error("❌ Failed to load models:", err);
  }
}

// LOAD REGISTERED USERS + DESCRIPTORS
async function loadRegisteredUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, student_id, name, major, face_images(descriptor)");

  if (error) return console.error(error);

  registeredUsers = data.map((u) => ({
    id: u.id,
    studentId: u.student_id,
    name: u.name,
    major: u.major,
    descriptors: u.face_images.map(
      (f) => new Float32Array(f.descriptor)
    ),
  }));
}

// DUPLICATE FACE CHECK
function isDuplicateFace(descriptor, threshold = 0.5) {
  if (!registeredUsers.length) return false;

  const matcher = new faceapi.FaceMatcher(
    registeredUsers.map(
      (u) => new faceapi.LabeledFaceDescriptors(u.studentId, u.descriptors)
    ),
    threshold
  );

  return matcher.findBestMatch(descriptor).label !== "unknown";
}

// REGISTER FACE
async function registerFace() {
  if (!modelsLoaded) {
    alert("Models are still loading");
    return;
  }

  // Safe DOM check
  const studentIdEl = document.getElementById("studentId");
  const nameEl = document.getElementById("name");
  const majorEl = document.getElementById("major");

  if (!studentIdEl || !nameEl || !majorEl) {
    alert("Registration form not found. Check HTML IDs.");
    console.error("Missing inputs", { studentIdEl, nameEl, majorEl });
    return;
  }

  const studentId = studentIdEl.value.trim();
  const name = nameEl.value.trim();
  const major = majorEl.value.trim();

  if (!studentId || !name || !major) {
    alert("Please complete all fields");
    return;
  }

  // Detect face
  const detection = await faceapi
    .detectSingleFace(video, faceDetectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return alert("No face detected");

  // Duplicate prevention
  if (isDuplicateFace(detection.descriptor)) {
    alert("This face is already registered");
    return;
  }

  // Insert user
  const { data: user, error } = await supabase
    .from("users")
    .insert({ student_id: studentId, name, major })
    .select()
    .single();

  if (error) return alert(error.message);

  // Insert face descriptor
  await supabase.from("face_images").insert({
    user_id: user.id,
    descriptor: Array.from(detection.descriptor),
  });

  // Show profile
  showProfile(user);

  // Refresh registered users
  await loadRegisteredUsers();

  alert("✅ Face registered successfully");
}

// SHOW STUDENT PROFILE
function showProfile(user) {
  const div = document.getElementById("profile");
  if (!div) return;

  div.innerHTML = `
    <h3>Student Profile</h3>
    <p><b>ID:</b> ${user.student_id}</p>
    <p><b>Name:</b> ${user.name}</p>
    <p><b>Major:</b> ${user.major}</p>
  `;
}

// MARK ATTENDANCE
async function markAttendance() {
  if (!modelsLoaded) {
    showMessage("reg-message", "Models still loading", "info");
    return;
  }

  const detection = await faceapi
    .detectSingleFace(video, faceDetectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return alert("No face detected");

  // Match face
  const matcher = new faceapi.FaceMatcher(
    registeredUsers.map(
      (u) => new faceapi.LabeledFaceDescriptors(u.studentId, u.descriptors)
    ),
    0.6
  );

  const match = matcher.findBestMatch(detection.descriptor);
  if (match.label === "unknown") return alert("Face not recognized");

  const user = registeredUsers.find((u) => u.studentId === match.label);
  if (!user) return;

  // Insert attendance (DB enforces 1/day)
  const { error } = await supabase.from("attendance").insert({
    user_id: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      alert("⚠️ Attendance already marked today");
    } else {
      console.error(error);
      alert("Failed to mark attendance");
    }
    return;
  }

  showProfile(user);
  alert(`✅ Attendance marked for ${user.name}`);
  loadDashboard();
}

// DASHBOARD
async function loadDashboard() {
  const table = document.getElementById("dashboard-body");
  if (!table) return;

  const { data, error } = await supabase
    .from("attendance")
    .select("timestamp, users!attendance_user_id_fkey(name)");

  if (error) return console.error(error);

  table.innerHTML = "";

  data.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.users?.name ?? "Unknown"}</td>
      <td>${new Date(row.timestamp).toLocaleString()}</td>
    `;
    table.appendChild(tr);
  });
}

// INIT: WAIT FOR DOM
document.addEventListener("DOMContentLoaded", () => {
  // Get elements
  video = document.getElementById("video");
  registerBtn = document.getElementById("registerBtn");
  attendanceBtn = document.getElementById("attendanceBtn");

  // Attach listeners
  if (registerBtn) registerBtn.addEventListener("click", registerFace);
  if (attendanceBtn) attendanceBtn.addEventListener("click", markAttendance);

  // Start camera and load models
  startCamera();
  loadModels();

  // Load dashboard
  loadDashboard();
});
