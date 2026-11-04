# Bot WhatsApp (application de bureau) — version « comportement humain »

Tu écris depuis ton téléphone au **second numéro** ; le bot répond comme une vraie personne
et t'écrit aussi de lui-même. Il ne répond qu'aux numéros autorisés.

## Ce qu'il fait comme un humain

- **Lecture puis « en train d'écrire… »** : elle ouvre la discussion (en ligne, message lu), lit,
  puis l'indicateur s'affiche pendant la frappe, avec des pauses et des hésitations, avant l'envoi.
- **Rythme de vie** : elle dort la nuit (réponse à son réveil), est en cours la journée,
  mange, se détend le soir. Les délais vont de quelques secondes à plusieurs minutes selon ce qu'elle fait,
  et elle répond vite quand vous êtes en pleine discussion.
- **Messages spontanés** : bonjour, pensée, anecdote, bonne nuit — jamais la nuit, jamais en pleine
  discussion, et elle n'insiste pas si tu ne réponds pas.
- **Fautes de frappe** corrigées juste après (« *mot »), **réactions emoji**, **citation** de ton message
  quand elle répond tard, apparition « en ligne » de temps en temps.
- **Vocaux et photos** : elle les écoute / les regarde (Gemini) et réagit.
- **Humeur** qui change dans la journée, **heure et activité** connues du personnage.
- **Mémoire à long terme** : un carnet de notes mis à jour régulièrement (goûts, projets, dates…).
- Les messages restés sans réponse sont repris si tu fermes puis rouvres l'application.
- **Une vie qui continue** : elle a des événements qui durent plusieurs jours (un examen, une dispute avec
  sa sœur, un projet avec Ania, une sortie, un rhume). Ils avancent d'étape en étape (la veille, le jour J,
  le résultat…) et elle t'en reparle d'elle-même (« j'ai eu mon exam ! »), au lieu de les inventer à chaque fois.
- **Imperfections** : certains jours elle n'a pas envie de parler (sèche, vexée ou froide pendant quelques
  heures, sans jamais être méchante ni te culpabiliser) puis elle revient avec un petit mot ; elle laisse parfois
  un message « lu » sans répondre tout de suite ; et quand elle s'emballe, elle envoie deux messages d'affilée.

## Obtenir l'exécutable avec GitHub

1. Crée un dépôt GitHub (privé, c'est mieux) et envoie-y **tout le contenu de ce dossier**,
   y compris le dossier caché `.github`.
2. Onglet **Actions** > **Build** > **Run workflow**.
3. Télécharge l'artefact **BotWhatsApp-windows** : il contient `BotWhatsApp.exe`.

(Ou en local : `npm install` puis `npm run dist`.)

## Utilisation

Prérequis : Google Chrome ou Microsoft Edge installé sur le PC.

1. Lance `BotWhatsApp.exe`.
2. Choisis le **fournisseur d'IA**, colle ta **clé API**, ton numéro dans **Numéros autorisés**.
3. Clique sur **Enregistrer et démarrer**, scanne le QR code avec WhatsApp du **second numéro**
   (Réglages > Appareils connectés > Associer un appareil).
4. Quand le statut affiche « Connecté », regarde le journal : une ligne indique
   « Indicateur « écrit… » : disponible » (ou le problème exact, à me transmettre).

## Tester sans attendre

Les délais réalistes peuvent durer des minutes. Pour tester :
- mets **Échelle de temps** à `0.1` (tout va 10× plus vite), ou
- décoche **Délais de réponse réalistes**.
Remets `1` ensuite.

## Quelle IA choisir ?

- **Gemini** : gratuit, mais les modèles « lite » écrivent plus « machine » et tiennent moins bien un personnage.
- **Claude** (`claude-sonnet-5-5`) ou un modèle OpenAI / Mistral via OpenRouter : nettement plus naturels
  en conversation, payants (quelques centimes par jour pour un usage normal).
- Les vocaux ne sont écoutés qu'avec Gemini ; avec les autres, elle dit qu'elle n'a pas pu écouter.

## Remarques

- Réglages, session WhatsApp, mémoire et état (`etat.json`, `memoire.json`, `historique.json`)
  sont dans le dossier de données de l'application (bouton « Ouvrir le dossier »).
- WhatsApp Web est utilisé de façon non officielle : WhatsApp peut restreindre un compte qui automatise
  ses messages. Utilise bien le second numéro.
- L'application doit rester ouverte (et le PC allumé) pour que les messages spontanés partent.
