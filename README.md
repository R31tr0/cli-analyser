# 🤖  CLI Code Analyser

<p align="center">
  <img src="https://img.shields.io/badge/javascript-F7DF1E?style=flat&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
  <img src="https://img.shields.io/badge/Google%20GenAI-Gemini%203.5-blue.svg" alt="Google GenAI">
</p>

<p align="center">
  <b>Профессиональный консольный AI-ассистент на базе Google Gemini для анализа кода, архитектуры и поиска ошибок прямо из терминала.</b>
</p>

---

## ⚠️ Важные требования перед запуском

1. 🌐 **VPN:** Поскольку сервисы Google AI Studio могут иметь региональные ограничения, для стабильной работы утилиты и запросов к API **обязательно требуется активный VPN**.
2. 🔑 **Google API Key:** Вам понадобится ключ доступа от Google AI Studio (его можно получить бесплатно за пару кликов). Утилита автоматически запросит его при первом запуске и сохранит в защищенном локальном файле.

---

## 📦 Установка

1. Клонируйте репозиторий на ваш компьютер:
   ```bash
   git clone https://github.com/R31tr0/cli-analyser.git

2. перейдите в директорию 
    ```bash
   cd cli-analyser
3. установите зависимости 
    ```bash
   npm install
4. сделайте тлуз публичной в системе 
    ```bash
   npm link

5. используйте в любом месте системы 
    ```bash
    cli-analyser
