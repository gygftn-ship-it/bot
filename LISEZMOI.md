# Bot WhatsApp (application de bureau)

Tu écris depuis ton téléphone au **second numéro**, le bot te répond dans le style
décrit, grâce à l'API Google Gemini. Il ne répond qu'aux numéros autorisés.

## Obtenir l'exécutable avec GitHub

1. Crée un dépôt GitHub (privé, c'est mieux) et envoie-y **tout le contenu de ce dossier**,
   y compris le dossier caché `.github` (le plus simple : GitHub Desktop, ou `git push`).
2. Sur GitHub, ouvre l'onglet **Actions** > **Build** > **Run workflow**.
3. Après quelques minutes, ouvre l'exécution terminée et télécharge l'artefact
   **BotWhatsApp-windows** : il contient `BotWhatsApp.exe`.

(Tu peux aussi compiler toi-même : `npm install` puis `npm run dist`.)

## Utilisation

Prérequis : Google Chrome ou Microsoft Edge installé sur le PC.

1. Lance `BotWhatsApp.exe`.
2. Colle ta **clé API Google** (aistudio.google.com/apikey), ton numéro dans
   **Numéros autorisés**, et décris le personnage (ou colle ton prompt).
3. Clique sur **Enregistrer et démarrer**.
4. Au premier lancement, scanne le QR code avec WhatsApp sur le **second numéro**
   (Réglages > Appareils connectés > Associer un appareil).
5. Quand le statut affiche « Connecté », écris à ce numéro depuis ton téléphone.

Le bot tourne tant que la fenêtre reste ouverte.

## Remarques

- Les réglages, la session WhatsApp et la mémoire sont enregistrés sur ton PC
  (dossier de données de l'application).
- WhatsApp Web est utilisé de façon non officielle : WhatsApp peut restreindre un compte
  qui automatise ses messages. Utilise bien le second numéro.
- Si le nom du modèle Gemini est refusé, remplace-le dans « Modèle Gemini ».
