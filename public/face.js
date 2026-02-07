import { supabase } from "./supabase.js";

const video = document.getElementById("video");
const registerBtn = document.getElementById("registerBtn");
const attendanceBtn = document.getElementById("attendanceBtn");

let modelsLoaded = false;
let registeredUsers = [];

// Start camera
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.error("Camera error:", err);
    alert("Cannot access camera. Check permissions.");
  }
}

// Load face-api models
async function loadModels() {
  try {
    const MODEL_URL =
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    ]);

    console.log("Face-api models loaded");
    modelsLoaded = true;

    // Load registered users from Supabase
    await loadRegisteredUsers();
  } catch (err) {
    console.error("Failed to load models:", err);
  }
}

// Stop video stream
function stopStream(videoElement) {
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
}

// Show message helper
function showMessage(elementId, message, type = "info") {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.className = type; // you can add CSS styling for info/success/error
  }
}

// Load registered users from Supabase
async function loadRegisteredUsers() {
  const { data, error } = await supabase.from("users").select("*");
  if (error) {
    console.error("Error fetching users:", error);
  } else {
    registeredUsers = data.map((u) => ({
      id: u.id,
      name: u.name,
      faceDescriptor: u.face_descriptor,
    }));
    console.log("Registered users loaded:", registeredUsers.length);
  }
}

// Register face
async function registerFace() {
  if (!modelsLoaded) {
    alert("Models are still loading. Please wait...");
    return;
  }

  const name = document.getElementById("name").value.trim();
  if (!name) return alert("Please enter a name");

  if (!video.srcObject) return alert("Camera not running");

  try {
    const detection = await faceapi
      .detectSingleFace(video)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      alert("No face detected. Please try again.");
      return;
    }

    // Optional: draw on canvas
    const canvas = document.getElementById("reg-canvas");
    if (canvas) {
      const displaySize = { width: video.videoWidth, height: video.videoHeight };
      faceapi.matchDimensions(canvas, displaySize);
      const resizedDetection = faceapi.resizeResults(detection, displaySize);
      faceapi.draw.drawDetections(canvas, resizedDetection);
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetection);
    }

    // Save user to Supabase
    const { data, error } = await supabase.from("users").insert({
      name,
      face_descriptor: Array.from(detection.descriptor),
    });

    if (error) {
      console.error(error);
      alert("Failed to register face. Check console.");
      return;
    }

    alert("Face registered successfully ✔");
    registeredUsers.push({ id: data[0].id, name, faceDescriptor: Array.from(detection.descriptor) });

  } catch (err) {
    console.error("Error during face registration:", err);
    alert("Error capturing face. Check console.");
  }
}

// Mark attendance
async function markAttendance() {
  if (!modelsLoaded) {
    showMessage("reg-message", "Models are still loading. Please wait...", "info");
    return;
  }

  if (!registeredUsers.length) {
    showMessage("reg-message", "No registered users found.", "error");
    return;
  }

  try {
    const detection = await faceapi
      .detectSingleFace(video)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      showMessage("reg-message", "No face detected. Please try again.", "error");
      return;
    }

    // Compare face descriptor with registered users
    const faceMatcher = new faceapi.FaceMatcher(
      registeredUsers.map(
        (u) =>
          new faceapi.LabeledFaceDescriptors(
            u.name,
            [new Float32Array(u.faceDescriptor)]
          )
      ),
      0.6
    );

    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    if (bestMatch.label === "unknown") {
      showMessage("reg-message", "Face not recognized.", "error");
      return;
    }

    const user = registeredUsers.find((u) => u.name === bestMatch.label);

    // Save attendance to Supabase
    const { data, error } = await supabase.from("attendance").insert({
      user_id: user.id,
      timestamp: new Date().toISOString(),
    });

    if (error) {
      console.error(error);
      showMessage("reg-message", "Failed to mark attendance.", "error");
      return;
    }

    showMessage("reg-message", `✅ Attendance marked for ${user.name}`, "success");
    console.log("Attendance data:", data);

  } catch (err) {
    console.error("Error marking attendance:", err);
    showMessage("reg-message", "Error during attendance. Check console.", "error");
  }
}

// Attach buttons
registerBtn.addEventListener("click", registerFace);
attendanceBtn.addEventListener("click", markAttendance);

// Init
startCamera();
loadModels();
