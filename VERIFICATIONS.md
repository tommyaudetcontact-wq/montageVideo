# Vérifications · 15 octobre 2026

Les essais utilisent des médias synthétiques locaux et un navigateur de bureau. Aucun fichier personnel n’a été transmis.

- Tests purs : interpolation des keyframes, rotation la plus courte, zoom continu de groupe, pop-up, pleine hauteur, continuité de division, filtrage des bords ; cache et plages natives réutilisées.
- Tests audio purs : programmation de lecture et mix export, avance/retard, gain, bornes du média découpé, saturation et mute.
- Test navigateur à 390 × 844 : clic Animation applique 0,25 s ; trajectoire à 45° suit la rotation ; maintien PIP ouvre la fenêtre sans dupliquer ; gain 200 % ; avance audio −0,2 s ; mix audio vérifié avec une rampe pour contrôler la position source et le gain.
- Fusion par sélection timeline en une capsule, auto-keyframes immédiat sur le groupe, division avec suppression du silence, poignées uniquement sur la sélection et extérieures à la durée visible.
- Passage carré / vertical et annulation/rétablissement ; glissement de timeline de 60 s jusqu’à son extrémité exacte.
- Export réel puis redécodage du MP4 fusionné : 720 × 1280, 18 images pour 0,6 s à 30 i/s, horodatages strictement croissants. Aucune erreur JavaScript dans le scénario.
- Benchmark à qualité identique, 30 masques pour 30 images natives : trois essais de 45 à 59 % de temps en moins (médiane 58 %, modèles chargés). Le test synthétique mesure le pipeline ; il ne valide pas l’esthétique des cheveux sur une vraie personne ni les performances d’un téléphone physique.

Sources des tests reproductibles conservées dans le dossier work de l’espace de travail (non déployées). Interface inspectée par capture mobile. Site statique, aucune compilation ni serveur d’application nécessaire en production.

## Sauvegarde, préréglages et gestes · version 15

- Tests purs des préréglages : noms, temps proportionnels sur clips plus courts/plus longs, géométrie proportionnelle, durée du pop-up, indépendance des identifiants de médias, coordonnées de rotation et tolérance des keyframes.
- Test navigateur avec une image PNG et un MP4 synthétique contenant une tonalité : sauvegarde automatique dans IndexedDB, rechargement de l’iframe, réouverture des Blobs, conservation du nombre de médias et de tout l’historique, y compris la branche Rétablir. Le test attend l’écriture automatique sans appeler la fonction de sauvegarde manuelle.
- Préréglage nommé enregistré et retrouvé après rechargement ; application sur un clip deux fois plus court : temps de keyframe 0,5 → 0,25 s et pop-up 0,25 → 0,125 s.
- Tap sur un masque synthétique : le sujet sélectionne le PIP ; sa moitié transparente sélectionne l’image derrière. Rotation de 90° avec deux doigts ; pinch sur la marge transparente du PIP précédemment tapé conserve ce PIP.
- Keyframe au curseur mise en évidence ; suppression au curseur, par maintien sur la timeline et par maintien dans la liste ; annulation des suppressions.
- Formes d’onde compactes conservées avec leurs pics de fin : test pur de couverture sur toute la largeur. Plages sonores réutilisables par AutoCut après restauration.
- Trois outils portent le badge +. Inspection visuelle de la palette et de la disposition sur mobile. Aucune erreur JavaScript dans le scénario de vérification.

Le contrôle des doigts utilise des PointerEvents synthétiques dans le navigateur de bureau ; aucun téléphone physique n’a été testé. La détection alpha utilise un masque déterministe pour vérifier la sélection, distinct de l’évaluation de qualité du modèle IA. Le stockage dépend du navigateur et de son quota ; les masques IA ne sont pas persistés.
