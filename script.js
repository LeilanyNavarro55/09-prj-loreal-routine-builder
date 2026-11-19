 /* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsButton = document.getElementById("clearSelections");
const generateRoutineButton = document.getElementById("generateRoutine");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");
const selectedProductsStorageKey = "lorealRoutineBuilderSelectedProducts";
const routineModel = "gpt-5-search-api";
const routineWorkerUrl =
  "https://chat-bot.navarroleilany219.workers.dev/";
const advisorInstructions =
  "You are a L'Oréal skincare and beauty advisor. Help with the generated routine and related topics such as skincare, haircare, makeup, and fragrance. Use web search for current information about L'Oréal products, ingredients, and routine guidance, and include citations for current claims. If asked about unrelated topics, politely explain that you can help with beauty and routine questions instead. Create practical guidance, explain product order and timing, and do not recommend products that were not selected for the generated routine.";

/* Keep selected products available when the category filter changes */
let selectedProducts = loadSelectedProducts();
let allProducts = [];
let productsLoaded = false;
let productLoadPromise;
let conversationMessages = [];
let routineGenerated = false;
let requestInProgress = false;

/* Restore saved products from this browser */
function loadSelectedProducts() {
  try {
    const savedProducts = localStorage.getItem(selectedProductsStorageKey);
    if (!savedProducts) return [];

    const products = JSON.parse(savedProducts);
    if (!Array.isArray(products)) {
      throw new Error("Saved selected products are not a list.");
    }

    return products.filter(
      (product) =>
        product &&
        Number.isFinite(product.id) &&
        typeof product.name === "string" &&
        typeof product.brand === "string" &&
        typeof product.category === "string" &&
        typeof product.description === "string"
    );
  } catch (error) {
    console.error("Could not load saved selected products:", error);
    return [];
  }
}

/* Save the current selections so they are available after a reload */
function saveSelectedProducts() {
  try {
    localStorage.setItem(
      selectedProductsStorageKey,
      JSON.stringify(selectedProducts)
    );
  } catch (error) {
    console.error("Could not save selected products:", error);
  }
}

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Choose a category or search for products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  if (productsLoaded) return allProducts;
  if (!productLoadPromise) {
    productLoadPromise = fetch("products.json")
      .then((response) => response.json())
      .then((data) => {
        allProducts = data.products;
        productsLoaded = true;
        return allProducts;
      })
      .catch((error) => {
        productLoadPromise = undefined;
        throw error;
      });
  }

  return productLoadPromise;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">No products match these filters.</div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map(
      (product) => `
    <article
      class="product-card ${isProductSelected(product.id) ? "selected" : ""}"
      data-product-id="${product.id}"
    >
      <button
        type="button"
        class="product-select-btn"
        aria-pressed="${isProductSelected(product.id)}"
      >
        <img src="${product.image}" alt="">
        <span class="product-info">
          <span class="product-name">${product.name}</span>
          <span class="product-brand">${product.brand}</span>
        </span>
      </button>
      <details class="product-description">
        <summary>Product description</summary>
        <p>${product.description}</p>
      </details>
    </article>
  `
    )
    .join("");
}

/* Check whether a product is already in the selected list */
function isProductSelected(productId) {
  return selectedProducts.some((product) => product.id === productId);
}

/* Update the selected appearance without closing open descriptions */
function updateProductSelectionStates() {
  productsContainer.querySelectorAll(".product-card").forEach((productCard) => {
    const selected = isProductSelected(Number(productCard.dataset.productId));
    productCard.classList.toggle("selected", selected);
    productCard
      .querySelector(".product-select-btn")
      .setAttribute("aria-pressed", selected);
  });
}

/* Keep the selected-products section updated */
function displaySelectedProducts() {
  clearSelectionsButton.disabled = selectedProducts.length === 0;

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="selected-products-empty">No products selected yet.</p>
    `;
    return;
  }

  selectedProductsList.replaceChildren();
  selectedProducts.forEach((product) => {
    const productChip = document.createElement("div");
    productChip.className = "selected-product-chip";

    const productName = document.createElement("span");
    productName.textContent = product.name;

    const productBrand = document.createElement("span");
    productBrand.className = "selected-product-brand";
    productBrand.textContent = `(${product.brand})`;
    productName.append(" ", productBrand);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-product-btn";
    removeButton.dataset.productId = product.id;
    removeButton.setAttribute("aria-label", `Remove ${product.name}`);

    const removeIcon = document.createElement("i");
    removeIcon.className = "fa-solid fa-xmark";
    removeIcon.setAttribute("aria-hidden", "true");
    removeButton.appendChild(removeIcon);

    productChip.append(productName, removeButton);
    selectedProductsList.appendChild(productChip);
  });
}

/* Show messages as text and render model-provided source links safely */
function displayChat(statusText = "") {
  chatWindow.replaceChildren();

  conversationMessages.forEach((message) => {
    if (message.role === "system") return;

    const messageElement = document.createElement("div");
    messageElement.className = `chat-message chat-message-${message.role}`;

    const speaker = document.createElement("strong");
    speaker.textContent = message.role === "user" ? "You" : "Routine Advisor";

    const messageContent = document.createElement("p");
    if (message.role === "assistant") {
      appendMessageLinks(message.content, messageContent);
    } else {
      messageContent.textContent = message.content;
    }

    messageElement.appendChild(speaker);
    messageElement.appendChild(messageContent);

    if (message.role === "assistant" && message.citations?.length) {
      const citationList = document.createElement("ul");
      citationList.className = "chat-citations";

      message.citations.forEach((citation) => {
        const citationItem = document.createElement("li");
        const citationLink = createSafeLink(citation.url, citation.title);
        if (citationLink) {
          citationItem.appendChild(citationLink);
          citationList.appendChild(citationItem);
        }
      });

      if (citationList.childElementCount > 0) {
        messageElement.appendChild(citationList);
      }
    }

    chatWindow.appendChild(messageElement);
  });

  if (statusText) {
    const status = document.createElement("p");
    status.className = "chat-status";
    status.textContent = statusText;
    chatWindow.appendChild(status);
  }

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Turn plain-text URLs and Markdown links into safe external links */
function appendMessageLinks(text, container) {
  const linkPattern =
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;
  let textStart = 0;
  let match;

  while ((match = linkPattern.exec(text)) !== null) {
    container.appendChild(document.createTextNode(text.slice(textStart, match.index)));
    const url = match[2] || match[3];
    const link = createSafeLink(url, match[1] || url);

    if (link) {
      container.appendChild(link);
    } else {
      container.appendChild(document.createTextNode(match[0]));
    }
    textStart = linkPattern.lastIndex;
  }

  container.appendChild(document.createTextNode(text.slice(textStart)));
}

/* Accept only HTTP(S) links from the model response */
function createSafeLink(url, label) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    const link = document.createElement("a");
    link.href = parsedUrl.href;
    link.textContent = label;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  } catch {
    return null;
  }
}

/* Send the complete conversation to the class-hosted Worker */
async function getAssistantReply(messages) {
  const response = await fetch(routineWorkerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: routineModel,
      messages: messages.map(({ role, content }) => ({ role, content })),
    }),
  });

  if (!response.ok) {
    throw new Error(`The routine service returned an error (${response.status}).`);
  }

  const data = await response.json();
  const assistantMessage = data.choices?.[0]?.message;
  if (
    !assistantMessage ||
    typeof assistantMessage.content !== "string" ||
    assistantMessage.content.trim() === ""
  ) {
    throw new Error("The routine service returned an empty or invalid response.");
  }

  const citations = Array.isArray(assistantMessage.annotations)
    ? assistantMessage.annotations
        .filter(
          (annotation) => annotation && annotation.type === "url_citation"
        )
        .map((annotation) => annotation.url_citation || annotation)
        .filter(
          (citation) =>
            typeof citation.url === "string" &&
            (citation.title === undefined || typeof citation.title === "string")
        )
        .map((citation) => ({
          url: citation.url,
          title: citation.title || citation.url,
        }))
    : [];

  return { content: assistantMessage.content, citations };
}

/* Prevent overlapping requests and keep chat locked until a routine exists */
function updateRequestControls() {
  generateRoutineButton.disabled = requestInProgress;
  userInput.disabled = requestInProgress || !routineGenerated;
  sendButton.disabled = requestInProgress || !routineGenerated;
}

updateRequestControls();
displayChat("Generate a routine to start asking follow-up questions.");

/* Select or unselect a product from the grid */
productsContainer.addEventListener("click", (e) => {
  const selectButton = e.target.closest(".product-select-btn");
  if (!selectButton) return;
  const productCard = selectButton.closest(".product-card");

  const productId = Number(productCard.dataset.productId);
  if (isProductSelected(productId)) {
    selectedProducts = selectedProducts.filter(
      (product) => product.id !== productId
    );
  } else {
    const product = allProducts.find((item) => item.id === productId);
    if (product) selectedProducts.push(product);
  }

  updateProductSelectionStates();
  displaySelectedProducts();
  saveSelectedProducts();
});

/* Remove a product directly from the selected-products section */
selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".remove-product-btn");
  if (!removeButton) return;

  const productId = Number(removeButton.dataset.productId);
  selectedProducts = selectedProducts.filter(
    (product) => product.id !== productId
  );
  updateProductSelectionStates();
  displaySelectedProducts();
  saveSelectedProducts();
});

/* Clear every selected product at once */
clearSelectionsButton.addEventListener("click", () => {
  selectedProducts = [];
  updateProductSelectionStates();
  displaySelectedProducts();
  saveSelectedProducts();
});

displaySelectedProducts();

/* Generate a routine using only the selected products */
generateRoutineButton.addEventListener("click", async () => {
  if (selectedProducts.length === 0) {
    displayChat("Select at least one product to generate a routine.");
    return;
  }

  const productsForRoutine = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  const routineMessages = [
    { role: "system", content: advisorInstructions },
    {
      role: "user",
      content: `Create my routine from these selected products:\n${JSON.stringify(
        productsForRoutine,
        null,
        2
      )}`,
    },
  ];

  requestInProgress = true;
  updateRequestControls();
  displayChat("Generating your personalized routine...");
  try {
    const routine = await getAssistantReply(routineMessages);
    conversationMessages = [
      ...routineMessages,
      { role: "assistant", ...routine },
    ];
    routineGenerated = true;
    displayChat();
  } catch (error) {
    console.error("Could not generate the routine:", error);
    displayChat(`Sorry, the routine could not be generated. ${error.message}`);
  } finally {
    requestInProgress = false;
    updateRequestControls();
  }
});

/* Apply the selected category and search text together */
async function updateProductGrid() {
  const products = await loadProducts();
  const selectedCategory = categoryFilter.value;
  const searchTerm = productSearch.value.trim().toLowerCase();

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      !selectedCategory || product.category === selectedCategory;
    const searchableText = [
      product.name,
      product.brand,
      product.category,
      product.description,
    ]
      .join(" ")
      .toLowerCase();
    const matchesSearch = searchableText.includes(searchTerm);

    return matchesCategory && matchesSearch;
  });

  displayProducts(filteredProducts);
}

/* Update results whenever the user changes either filter */
categoryFilter.addEventListener("change", updateProductGrid);
productSearch.addEventListener("input", updateProductGrid);

/* Add follow-up questions and replies to the full conversation history */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();
  if (!question || !routineGenerated || requestInProgress) return;

  conversationMessages.push({ role: "user", content: question });
  requestInProgress = true;
  updateRequestControls();
  displayChat("Thinking...");

  try {
    const reply = await getAssistantReply(conversationMessages);
    conversationMessages.push({ role: "assistant", ...reply });
    userInput.value = "";
    displayChat();
  } catch (error) {
    console.error("Could not answer the follow-up question:", error);
    conversationMessages.pop();
    displayChat(`Sorry, I couldn't answer that. ${error.message}`);
  } finally {
    requestInProgress = false;
    updateRequestControls();
  }
});
