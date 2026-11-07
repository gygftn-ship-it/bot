# v8.2 — le charme qui se construit (aucun appel IA en plus)

Tout est suggéré, jamais cru : les limites de la v8.1 (« jamais pornographique ») sont inchangées.

## 1. Tension sur plusieurs jours (`tensionActive`, `tensionJoursMax`) — tension.js
- Quand un moment a chauffé ET qu'elle l'a laissé en suspens (« plus tard », « tu verras », un « non » joueur…), un **fil** s'ouvre (pas à chaque fois : environ 7 fois sur 10).
- Jour +1 : **allusion** (une phrase très courte). Jour +2 : **attente** (elle le fait patienter). Dernier jour : **relâche** tendre (un aveu, l'envie d'un long appel ou d'un vocal), et le fil se ferme.
- Un seul fil à la fois, **4 jours de pause** entre deux fils. Jamais si le jour est « sage », si le lien est encore frais, si elle boude ou est blessée (le fil est alors abandonné en silence).
- Le bloc n'est donné que 3 fois par jour au plus ; en plus, **un message spontané par jour** au maximum (entre 15 h et 22 h), très court.
- Réglage : `tensionJoursMax` (3 par défaut, de 1 à 5).

## 2. (retiré en v8.3) le « non » joueur

## 3. Le rythme (`rythmeSensuel`)
- Dans les moments chauds (ou pendant un fil) : un message **très court** qui laisse un blanc, **deux bulles** hésitantes, ou un **petit silence** de 20 à 55 s avant de répondre.
- Jamais deux fois le même d'affilée, « très court » au plus une fois sur trois. La forme est **garantie par le programme** (une seule bulle de 70 caractères maximum si « très court »), même si le modèle déborde.

## 4. (retiré en v8.3) les photos de sa journée

## Coût
- Aucun appel IA en plus.

## Vérifier
`npm test` (ou `node test-tension.js` seul : 37 vérifications, aucune connexion).
