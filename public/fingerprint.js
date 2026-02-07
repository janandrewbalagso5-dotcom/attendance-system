import { supabase } from "./supabase.js";

window.verifyFingerprint = async function (userId) {
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array(32),
        userVerification: "required"
      }
    });

    await supabase.from("attendance").insert({
      user_id: userId
    });

    alert("Attendance recorded ✔");
  } catch {
    alert("Fingerprint verification failed ❌");
  }
};
