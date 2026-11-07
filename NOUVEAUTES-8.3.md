# v8.3 — retraits et réparations

## Retiré
- **Les photos de sa journée** : plus de dossier `photos/`, plus d'envoi, plus de réglages `photos*`. Elle ne parle plus de photo qu'elle enverrait. Les photos que **tu** lui envoies sont toujours comprises.
- **Le « non » joueur** : plus de refus joueur (languir, défi, pudeur, report) ni de réglages `refusJoueur*`. Le rappel « s'il dit non, stop, elle s'arrête net » reste, ainsi que le fil de tension et le rythme.
- Les anciens réglages restent sans effet dans ta configuration : rien à nettoyer.

## Réparé : réactions emoji, réponses en citant, messages spontanés
- Le bot ne dépend plus d'un nom de module WhatsApp Web précis : si le nom connu a disparu, il **cherche la fonction par son nom** (réaction, envoi avec citation).
- Les messages de secours : si `whatsapp-web.js` n'arrive pas à envoyer (message spontané compris), le bot envoie **directement par WhatsApp Web**, avec ou sans citation.
- Le journal ne dit plus « mets à jour whatsapp-web.js » : il dit ce qui marche, ce qui passe en secours, et ce qui reste indisponible.
- Journal des messages spontanés : la raison affichée est la vraie (elle dort, panne ou absence, pas d'humeur, elle boude, échange trop récent, plafond atteint) au lieu de « pas disponible » pour tout.
- Pendant le Ramadan, elle n'est plus bloquée toute la journée par un seuil de disponibilité trop haut.

## Vérifier
`npm test` : 66 + 20 + 20 + 6 vérifications, aucune connexion. `node test-page.js` vérifie les chemins de secours avec une fausse page WhatsApp Web.
