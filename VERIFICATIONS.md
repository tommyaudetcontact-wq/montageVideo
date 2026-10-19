# Vérifications — PocketCut Studio V2

## Montage par scènes

- Tests unitaires du moteur : création d’une scène dans une plage partielle, division aux limites, une seule narration canonique, illustration dérivée sans copie de média.
- Nettoyage intérieur : voix et sujet conservent les mêmes temps source ; l’illustration vidéo saute les mêmes portions supprimées. Le zoom et le pop-up restent continus sur les morceaux d’une scène.
- Modifications de pose partagées entre morceaux liés, remplacement d’une partie avec une nouvelle identité de scène, continuité optionnelle entre PIP voisins de même pose, zoom distinct de chaque fond.
- Compositions sans fichier média imposé, pose/keyframes normalisées à la durée, rétablissement du rendu face caméra, cadrage de l’écran partagé.
- Fonds vidéo : segments bouclés dans la durée source et gel final silencieux. Test navigateur supplémentaire : gel réellement immobile pendant la lecture (lecteur vidéo en pause au temps source fixé), boucle avec temps source valide et aperçu synchronisé.

## Test navigateur de bout en bout

Vidéo de contrôle de 4 s (360 × 640, 30 images/s), audio synthétique avec deux plages sonores et des silences, image issue localement de la référence fournie. Modèle de segmentation réel, aucune vidéo envoyée à un service d’analyse.

- Import via Prises ; scène par Illustrer avec zoom 15 % et pop-up 0,25 s.
- Lecture : un seul lecteur audio de narration.
- Composition enregistrée puis retrouvée dans un autre projet.
- AutoCut : proposition sans mutation, deux portions conservées et une seule scène ; annulation/rétablissement.
- Écran partagé, retour face caméra, annulation du retour ; application de composition sur la durée raccourcie.
- Changement de projet puis rechargement complet : scènes, médias et historique Undo retrouvés.
- Geste pointer tactile sur les capsules : réordonnancement sans écrasement ; illustrations suivant leur narration ; Undo.
- MP4 H.264/AAC exporté puis redécodé : 75 images attendues après nettoyage, illustration présente ; audio au niveau d’une seule voix, sans doublage.
- Aucune erreur JavaScript observée dans ce scénario.

## Régressions et livraison

Tests conservés de la V1 : crop, poignées/ripple, multisélection, z-index indépendant des pistes, duplication, gel, animations, préréglages, audio, waveform et cache de masques. Tous les scripts passent la vérification de syntaxe. Fichiers IA vérifiés par empreintes. Archives testées.

Le dossier V1 est comparé octet par octet à sa dernière archive livrée et reste intact. Le stockage IndexedDB et OPFS de la V2 porte son propre préfixe.

## Limites de validation

Affichage et interactions mobiles testés dans un cadre de navigateur de 390 px sur PC. Aucun essai sur Pixel 9 physique ni projet réel de plusieurs Go dans cette livraison. La détection de silence repose sur le niveau sonore et ne reconnaît pas la meilleure prise. Le modèle de détourage conserve ses limites de segmentation. Les projets V1 ne sont pas migrés automatiquement vers la V2.


## Version 2.0.1 — corrections demandées

- AutoCut par défaut : un clic applique le dernier bloc parlé, avec le même calcul de bornes que la V1 (début −0,08 s, fin +0,15 s). Pas de suppression des pauses intérieures dans ce mode. Options par maintien ; Undo conservé.
- Six placements : contrôle géométrique de la tranche coupée de la source après rotation ; elle reste hors du cadre, y compris dans les coins du haut. Référence de tête dans le cadre ; contrôle visuel des six rendus avec modèle IA réel.
- Écran partagé : visage dans une bande de 30 %, position verticale réglable, fond dans les 70 % restants avec zoom 35 %.
- Galerie du projet : vignettes, Ajouter, badges Déjà importé / Utilisé. Le bouton déclenche l’input natif acceptant images et vidéos. Réimport du même fichier (nom/taille/date identiques) : média réutilisé et nombre de fichiers stable.
- Navigateur : scénario de contrôle réussi, mode classique appliqué directement et annulé ; pas d’erreur JavaScript observée. Galerie Android système non modifiable : les badges sont dans l’application.
- Vérification de syntaxe des scripts, tests du moteur de scènes et des six placements, ressources IA inchangées et archive vérifiée. Pas d’essai sur un Pixel 9 physique.
