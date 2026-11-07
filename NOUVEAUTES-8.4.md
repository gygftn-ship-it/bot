# v8.4 — l'intimité qui s'installe (aucun appel IA en plus)

Tout est **suggéré, jamais cru** (les limites des versions précédentes sont inchangées), et son « non » à lui passe avant tout :
s'il dit non, stop, ou semble mal à l'aise, elle s'arrête net, avec tendresse. Tout est dans `intimite.js` (fonctions pures, testées).
Interrupteur général : `intimiteActive` (coupé aussi si `coquin` = 0, ou si elle est freinée par son humeur ou un moment occupé).

## 1. Présence physique suggérée (`presenceActive`)
- Le soir seulement : la chaleur de la soirée, son parfum, sa voix qui baisse, ce qu'elle porte pour dormir (la tenue et le parfum du jour sont ceux de `personnalite.js`, donc cohérents).
- Une ou deux touches, jamais plus, pas à chaque message (3 fois par jour au plus), jamais de vocabulaire anatomique.

## 2. Les nuits (`nuitsActives`, `reveilNuitProba`)
- **Insomnie** : une nuit sur quatre environ, 5 à 55 min après qu'elle est couchée, elle écrit « j'arrive pas à dormir… » (seulement si vous avez échangé dans la journée, jamais sans lien, 2 fois par semaine au plus). Si tu réponds, elle reste éveillée et répond vite tant que l'échange dure (40 min de silence max).
- **Réveil** : quand tu écris pendant qu'elle dort, elle peut se réveiller (15 % par défaut, +25 % si ton message est tendre ; jamais juste après le coucher ni juste avant son réveil ; 1 par nuit, 2 par semaine). Elle répond après 40 s à 4 min, à moitié endormie : 2 bulles courtes, voix basse, plus câline. La forme est garantie par le programme.

## 3. Scénarios imaginés (`scenariosActifs`)
- Quand l'un de vous lance « si tu étais là ce soir… », « on pourrait aller… », « imagine… », « la dernière fois… » (dans une ambiance tendre ; un simple « on pourrait réviser » ne compte pas), le scénario est noté.
- Il revient les jours suivants, une reprise courte par jour, 3 reprises au plus, oublié après 7 jours. Parfois un message spontané (20 h – 21 h 40) le ramène. Elle peut aussi en lancer un elle-même, une fois par soirée au plus, quand le jour est joueur.

## 4. Langage intime qui évolue (`langageIntime`)
- 4 stades de surnoms (mon cœur → mon amour → mon tentateur… → mon homme…), selon le lien et le nombre de jours où ça a chauffé. Deux surnoms « du moment » par semaine ; un nouveau surnom est essayé avec un peu de gêne.
- 3 petits mots à elle (toujours les mêmes), qui reviennent de temps en temps.
- Quand elle est troublée : phrases coupées, « … », moins de ponctuation, minuscules. La forme est garantie par le programme (liens et emojis intacts).

## 5. Jalousie douce et taquinerie (`jalousieDouce`)
- Il parle d'une autre fille : une pique pour rire, jamais d'interrogatoire ni de reproche ; s'il rit ou la rassure, elle fond ; s'il est agacé, elle dit qu'elle rigolait. Rien si elle est déjà vraiment jalouse (l'humeur gère) ou freinée.
- Provocation légère (« tu crois que tu me résistes ? ») parfois, seulement quand ça flirte déjà. 2 fois par jour au plus.

## Coût
- Aucun appel IA en plus : environ 300 à 500 tokens de prompt en plus quand plusieurs blocs sont actifs.

## Vérifier
`npm test` : 66 + 20 + 20 + 30 + 6 vérifications, aucune connexion. `node test-intimite.js` seul : 30 vérifications (dont le branchement dans le bot).
