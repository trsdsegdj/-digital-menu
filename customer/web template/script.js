const categoryButtons = document.querySelectorAll(".cat, .category");
categoryButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    categoryButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

const quickButtons = document.querySelectorAll(".quick");
quickButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("plain")) return;
    quickButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

const buyButton = document.querySelector(".buy");
if (buyButton) {
  buyButton.addEventListener("click", e => {
    e.currentTarget.textContent = "Added ✓";
  });
}

const chatButton = document.querySelector(".chat");
if (chatButton) {
  chatButton.addEventListener("click", () => {
    alert("Chat support");
  });
}

const addButtons = document.querySelectorAll(".add-to-cart-btn");
addButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const prev = btn.textContent;
    btn.textContent = "Added ✓";
    setTimeout(() => btn.textContent = prev, 1000);
  });
});
