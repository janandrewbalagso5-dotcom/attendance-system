// auth.js
import { supabase } from "./supabase.js";

// SIGN UP
window.signUp = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    alert(error.message);
  } else {
    alert("Signup successful! Check your email.");
  }
};

// LOGIN
window.login = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert(error.message);
  } else {
    alert("Login successful ✔");
    checkSession();
  }
};

// LOGOUT
window.logout = async function () {
  await supabase.auth.signOut();
  alert("Logged out");
  location.reload();
};

// SESSION CHECK
export async function checkSession() {
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    document.getElementById("authSection").style.display = "block";
    document.getElementById("appSection").style.display = "none";
  } else {
    document.getElementById("authSection").style.display = "none";
    document.getElementById("appSection").style.display = "block";
  }
}

// Auto-check session on page load
checkSession();
