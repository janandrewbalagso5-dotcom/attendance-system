import { supabase } from "./supabase.js";

let video;
let registerBtn;
let attendanceBtn;

let registrationMode = "new";
let currentUser = null;

let modelsLoaded = false;
let registeredUsers = [];

/* =======================
   FACE DETECTOR OPTIONS
======================= */
const faceDetectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 224,
  scoreThreshold: 0.5,
});

/* =======================
   CAMERA
======================= */
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.error(err);
    alert("Cannot access camera");
  }
}

/* =======================
   LOAD MODELS
======================= */
async function loadModels() {
  const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);

  modelsLoaded = true;
  await loadRegisteredUsers();
  console.log("✅ Face-api models loaded");
}

/* =======================
   LOAD USERS + DESCRIPTORS
======================= */
async function loadRegisteredUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, student_id, name, major, face_images(descriptor)");

  if (error) return console.error(error);

  registeredUsers = data.map(u => ({
    id: u.id,
    student_id: u.student_id, // KEEP CONSISTENT
    name: u.name,
    major: u.major,
    descriptors: u.face_images.map(
      f => new Float32Array(f.descriptor)
    )
  }));
}

/* =======================
   FACE HELPERS
======================= */
function euclideanDistance(d1, d2) {
  let sum = 0;
  for (let i = 0; i < d1.length; i++) {
    sum += (d1[i] - d2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function isDuplicateFace(descriptor, threshold = 0.35) {
  for (const user of registeredUsers) {
    for (const saved of user.descriptors) {
      const distance = euclideanDistance(descriptor, saved);
      console.log("Distance:", distance);
      if (distance < threshold) return true;
    }
  }
  return false;
}

function capturePhoto() {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg");
}

/* =======================
   LATE / ON-TIME LOGIC
======================= */
function getAttendanceStatus(date = new Date()) {
  const hour = date.getHours();
  const minute = date.getMinutes();
  if (hour < 8) return "ON TIME";
  if (hour === 8 && minute === 0) return "ON TIME";
  return "LATE";
}

/* =======================
   REGISTER FACE
======================= */
async function registerFace() {
  if (!modelsLoaded) return alert("Models still loading");

  const studentId = document.getElementById("studentId")?.value.trim();
  const name = document.getElementById("name")?.value.trim();
  const major = document.getElementById("major")?.value.trim();

  if (!studentId || !name || !major)
    return alert("Complete all fields");

  const detection = await faceapi
    .detectSingleFace(video, faceDetectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return alert("No face detected");

  if (isDuplicateFace(detection.descriptor))
    return alert("This face is already registered");

  let user;

  // ADD FACE TO EXISTING STUDENT
  if (registrationMode === "addFace") {
    const { data } = await supabase
      .from("users")
      .select("id, student_id, name, major")
      .eq("student_id", studentId)
      .single();

    if (!data) return alert("Student not found");
    user = data;
  }

  // NEW STUDENT
  else {
    const { data, error } = await supabase
      .from("users")
      .insert({ student_id: studentId, name, major })
      .select("id, student_id, name, major")
      .single();

    if (error) return alert(error.message);
    user = data;
  }

  const photo = capturePhoto();

  await supabase.from("face_images").insert({
    user_id: user.id,
    descriptor: Array.from(detection.descriptor),
    photo
  });

  currentUser = user;
  showProfile(user, photo);
  await loadRegisteredUsers();

  alert(" Face registered successfully");
}

/* =======================
   PROFILE CARD
======================= */
function showProfile(user, photo = null) {
  const card = document.getElementById("profileCard");
  if (!card) return;

  card.hidden = false;
  document.getElementById("profileName").innerText = user.name;
  document.getElementById("profileStudentId").innerText = user.student_id;
  document.getElementById("profileMajor").innerText = user.major;

  if (photo) {
    document.getElementById("profilePhoto").src = photo;
  }
}

/* =======================
   ATTENDANCE
======================= */
async function markAttendance() {
  if (!modelsLoaded) return alert("Models still loading");

  const detection = await faceapi
    .detectSingleFace(video, faceDetectorOptions)
    .withFaceLandmarks()  
    .withFaceDescriptor();

  if (!detection) {
    hideProfile();
    return alert("No face detected");
  }

  const matcher = new faceapi.FaceMatcher(
    registeredUsers.map(
      u => new faceapi.LabeledFaceDescriptors(
        u.student_id, 
        u.descriptors
      )
    ),
    0.6
  );

  const match = matcher.findBestMatch(detection.descriptor);
 if (match.label === "unknown") {
    hideProfile();
    return alert("Face not recognized");
  }

  const user = registeredUsers.find(
    u => u.student_id === match.label
  );

  if (!user) return alert("User not found");

  const status = getAttendanceStatus(new Date());

  const { error } = await supabase
    .from("attendance")
    .insert({ user_id: user.id });

  if (error?.code === "23505")
    return alert(" Attendance already marked today");

  showProfile(user);
  alert(` Attendance marked for ${user.name}`);
  loadDashboard();
}

// Dashboard
async function loadDashboard() {
  const table = document.getElementById("dashboard-body");
  if (!table) return;

  const { data, error } = await supabase
    .from("attendance")
    .select("timestamp, status, users(*)");

  if (error) return console.error(error);

  table.innerHTML = "";

  data.forEach(row => {
    const timePH = new Date(row.timestamp + "Z").toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });

    table.innerHTML += `
      <tr>
        <td>${row.users?.name ?? "Unknown"}</td>
        <td>${timePH}</td>
        <td>
          <span class="${row.status === "LATE" ? "late" : "ontime"}">
            ${row.status}
          </span>
        </td>
      </tr>`;
  });
}

/* =======================
   MODE BUTTONS
======================= */
document.getElementById("newStudentBtn")?.addEventListener("click", () => {
  registrationMode = "new";
  alert("New Student Mode");
});

document.getElementById("existingStudentBtn")?.addEventListener("click", () => {
  registrationMode = "addFace";
  alert("Add Face Mode");
});

/* =======================
   INIT
======================= */
document.addEventListener("DOMContentLoaded", () => {
  video = document.getElementById("video");
  registerBtn = document.getElementById("registerBtn");
  attendanceBtn = document.getElementById("attendanceBtn");

  registerBtn?.addEventListener("click", registerFace);
  attendanceBtn?.addEventListener("click", markAttendance);

  startCamera();
  loadModels();
  loadDashboard();

  setInterval(loadDashboard, 30000);
});
