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
- **Mémoire à long terme** : un carnet de notes mis à jour régulièrement (goûts, projets, dates…), avec les rendez-vous que tu lui annonces.
- Les messages restés sans réponse sont repris si tu fermes puis rouvres l'application.
- **Une vie qui continue** : elle a des événements qui durent plusieurs jours (un examen, une dispute avec
  sa sœur, un projet avec Ania, une sortie, un rhume). Ils avancent d'étape en étape (la veille, le jour J,
  le résultat…) et elle t'en reparle d'elle-même (« j'ai eu mon exam ! »), au lieu de les inventer à chaque fois.
- **Imperfections** : certains jours elle n'a pas envie de parler (sèche, vexée ou froide pendant quelques
  heures, sans jamais être méchante ni te culpabiliser) puis elle revient avec un petit mot ; elle laisse parfois
  un message « lu » sans répondre tout de suite ; et quand elle s'emballe, elle envoie deux messages d'affilée.

## Mise à jour 8.4 : la version PC rattrape la version Termux

L'application de bureau utilise maintenant **le même cerveau** que la version Termux (`bot.js` et tous ses modules). Tout ce qui existe côté téléphone existe côté PC, avec les mêmes réglages, qui ont désormais **chacun un champ dans la fenêtre** (nouvelles sections : *Écriture et crédibilité*, *Vie intérieure et passé*, *Vraie vie : pannes, absences, promesses*, *Suites de la relation*, *Séduction et intimité*). Les détails de chaque version sont dans `NOUVEAUTES-8.1.md` à `NOUVEAUTES-8.4.md`.

**En bref**
- **Vie intérieure** : émotions qui durent (joie, gêne, tendresse, émue, nostalgique, stressée…), lien affectif, fatigue et stress, opinions et envies, petits maux du jour, sommeil qui varie d'un jour à l'autre.
- **Passé et entourage** : famille, amies et histoires qui avancent de semaine en semaine (fiançailles de Sarah, BEM d'Inès, olives au village…), toujours cohérents.
- **Vraie vie** : pannes (réseau, data, batterie, courant), petites absences (« ma mère m'appelle »), promesses tenues ou excusées, journée racontée mémorisée tout de suite.
- **Suites de la relation** : le lendemain d'un moment tendre, habitudes d'horaires, petites bouderies puis réconciliation.
- **Séduction et intimité** (suggérées, jamais crues ; ton « non » passe avant tout) : tension sur plusieurs jours, rythme des messages, présence le soir, nuits (insomnie, réveil), scénarios imaginés, surnoms qui évoluent, jalousie douce. Réglage **Audace** (0 = coupé).
- **Écriture** : style SMS, emojis réservés surtout aux messages d'amour, contrôle de crédibilité avant l'envoi (plus de phrases d'assistant ni de répétitions), compréhension du contexte (message cité, repères de temps, darija / arabizi).
- **Messages spontanés** plus fiables : envie recalculée à chaque minute, raison réelle affichée dans le journal quand elle n'écrit pas.
- **Réparations** : réactions emoji, réponses en citant et « écrit… » retrouvent leur chemin même quand WhatsApp Web change ; envoi de secours direct par WhatsApp Web.
- **Mémoire** plus économe : elle ne charge que ce qui sert à la conversation, et les fichiers ont une copie de secours (`.bak`).

**Ce qui change pour toi**
- Ta config (clé API, numéros, prénoms, prompt…) est **conservée**. Au premier lancement, la config passe de la version 6 à la version 8 : les heures de réveil/coucher (7 h 30 / 0 h 30), la variation du sommeil et les messages spontanés (4 par jour, mode « probabiliste ») sont remis aux valeurs recommandées, une seule fois. Revois-les ensuite si tu les avais changés.
- La fenêtre a beaucoup plus de réglages : les valeurs par défaut sont celles recommandées, tu n'as rien à toucher.
- « Effacer la mémoire du bot » supprime aussi les copies de secours.
- `npm test` lance maintenant cinq fichiers de tests (aucune connexion) : `test.js`, `test-pannes.js`, `test-tension.js`, `test-intimite.js`, `test-page.js`.
- Un seul fichier (`reglages.js`) contient les réglages par défaut et leurs bornes, partagé avec la version Termux.

## Nouveautés de la version 3.6 : une vraie vie

- **Une année universitaire** : rentrée mi-septembre, partiels de janvier et de mai-juin, vacances d'hiver et de printemps,
  rattrapages, **grandes vacances d'été** (plus de cours en août !). Pendant les vacances elle se lève plus tard et ses après-midi
  changent (plage, glaces, sieste). Pendant les partiels, elle est plus stressée et moins disponible.
- **De nouveaux événements** : journées à la plage (Tigzirt, Azeffoun…) en été, mariages dans la famille (la tenue, la veille, la fête,
  la fatigue du lendemain). Pas d'examen ni d'exposé en vacances.
- **Un monde qui dure des semaines** : une série qu'elle regarde (saison, épisode, qu'elle finit puis remplace), un livre qu'elle
  avance page après page, une langue qu'elle apprend (série de jours sur l'appli), un défi du moment. Chaque semaine, il se passe aussi
  quelque chose autour d'elle (Inès a des contrôles, ta mère reçoit de la famille, Ania a des soucis…), et elle a ses habitudes
  (couscous du vendredi, ménage du samedi…). Elle peut t'en parler d'elle-même dans un message spontané.
- **Elle se souvient de ce qu'elle t'a raconté sur sa vie** (« j'ai vu ma tante samedi ») pour ne jamais se contredire d'un jour à
  l'autre. Visible et modifiable dans l'éditeur de mémoire.
- Réglages dans « Une vraie vie » (deux cases pour tout couper si tu préfères l'ancien comportement).

## Nouveautés de la version 3.5

- **Moins « IA », plus naturelle** : chaque message passe par un filtre d'écriture orale. Plus de « Bien sûr ! » au début ni de
  « N'hésite pas… » à la fin, plus de tirets longs ni de point final sur un message court, et la négation devient orale
  (« je sais pas », « c'est pas », « ça marche pas »). Case « Écriture orale » pour le couper.
- **Mémoire à long terme en deux étages** :
  - le **carnet de faits** est classé par rubriques (lui, famille, goûts, projets, nous deux, sujets en suspens), garde jusqu'à
    40 lignes et ne supprime plus une info valable pour faire de la place ;
  - les **souvenirs datés** (« le 3 nov : il m'a raconté son entretien raté ») : elle y fait allusion (« l'autre jour tu m'avais dit… »)
    quand le sujet revient, et ceux qui ressemblent à ton message sont retrouvés automatiquement.
- **Elle repense à vos discussions** : des messages spontanés « souvenir » (« alors, ton exam de maths ? »), jamais deux fois
  le même souvenir en 10 jours. Case « Elle repense à vos anciennes discussions ».
- **Interface** : **profils rapides** (Équilibrée, Très vivante, Discrète, Économe) qui règlent plusieurs réglages d'un coup, et un
  **éditeur de mémoire** pour lire, corriger ou compléter ce qu'elle sait de toi.

## Nouveautés de la version 3.4

- **Elle te pose des questions** : nouveau réglage **Curiosité** (0 à 100, 45 par défaut) dans « Souvenirs et naturel ».
  Elle réagit d'abord à ton message, puis pose une vraie question : soit sur ce que tu viens de dire, soit sur un sujet
  pour mieux te connaître (famille, goûts, projets, souvenirs…). Elle varie les sujets, évite deux questions de suite et ne
  redemande pas ce qu'elle sait déjà. Elle peut aussi t'écrire d'elle-même pour te poser une question. 0 = comme avant (questions rares).

## Nouveautés de la version 3.3.1

- **Plus de message perdu** : si l'IA est en panne ou le quota atteint, le message est repris automatiquement (3 essais : 1, 2 puis 3 minutes).
- **Anti-doublon** : un message que WhatsApp signale deux fois n'est traité qu'une fois.
- **Réinitialisation** complète, y compris les messages citables.

## Nouveautés de la version 3.3

- **Répondre à un message précis** : comme le « répondre » de WhatsApp, elle peut citer l'un de tes 6 derniers messages
  (une question posée avant ton dernier message, un sujet resté en suspens qu'elle reprend) au lieu de toujours répondre
  « dans le vide ». Elle le fait rarement, quand ça rend la discussion plus claire et plus vivante, comme une vraie histoire
  qui se déroule. Réglage : case « Citer un message précis… ».

## Nouveautés de la version 3.2

- **Une vraie journée** : la météo du jour (pluie, soleil, chaleur selon la saison) et de petits faits réels, tirés une
  fois par jour et toujours les mêmes pour une même journée (le bus bondé, le prof absent, le plat du déjeuner…).
  Quand tu demandes « t'as fait quoi aujourd'hui ? », elle répond d'après ces faits au lieu d'inventer, et reste cohérente.
- **Calendrier et culture** : elle connaît les anniversaires (le tien et le sien, avec un vrai message le jour J, et une
  surprise en préparation les jours d'avant), Yennayer, l'Aïd, le début du Ramadan, le 1er novembre, le vendredi en famille…
- **Ramadan** : elle jeûne, se lève et se couche plus tard, n'a pas de déjeuner, prépare l'iftar et rompt le jeûne au
  coucher du soleil (heure calculée pour sa ville). Si ton pays commence un jour plus tard que l'Arabie saoudite,
  mets 1 dans « Décalage du Ramadan ».
- **Elle retient ce que tu lui annonces** : un examen, un entretien, un voyage… Elle te souhaite bonne chance le jour J,
  puis demande « alors, comment ça s'est passé ? » le lendemain, et y fait allusion les jours d'avant.
- **Moins de répétitions** : elle évite de recommencer toujours par le même mot, de remettre les mêmes emojis ou de finir
  chaque message par une question.
- **Longueur en miroir** : elle écrit court quand tu écris court, plus long quand tu te confies.
- **Bien-être** : si tu lui dis sérieusement que tu vas mal, elle laisse les blagues de côté et t'écoute.
- Le journal (`journal.txt`) est archivé automatiquement au-delà de 2 Mo.

Tout se règle dans les nouvelles sections « Culture, calendrier et journée vécue » et « Souvenirs et naturel ».

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
   « Indicateur « écrit… » : disponible » (ou le problème exact, à me transmettre), puis
   « Réactions emoji : disponibles » (même principe). Chaque réaction indique ensuite si elle a été
   envoyée et vérifiée, ou seulement transmise à la bibliothèque, ou la raison de l'échec.

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
