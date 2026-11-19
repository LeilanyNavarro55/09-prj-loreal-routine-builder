# Project 9: L'Oréal Routine Builder
L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder. 

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

Search the product catalog by name or keyword, and combine the search with the category filter.

For an RTL translation, set `dir="rtl"` on the `<html>` element. The product grid, selected products, and chat layout use the document direction.

The chatbot uses OpenAI's `gpt-5-search-api` model for current web information.
Its class-hosted Worker must forward the requested model and return search
citations so the app can display the source links.