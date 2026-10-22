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


## Vérifications de la version 2.1.0

- Choix Créer / Modifier / Supprimer testés dans le navigateur ; suppression du projet inactif et du dernier projet testée sur un stockage simulé isolé. Les médias partagés et les préréglages sont conservés.
- Galerie : sujet détouré et fonds présents, autres prises de narration masquées.
- Auto zoom vérifié à 0 %, au milieu et à la fin (35 % dans le test).
- Pop-out : diminution de taille visible avant le déplacement final, opacité nulle à la fin. Continuité des scènes coupées et axe de rotation vérifiés.
- Reconnaissance de deux vraies prises : retrait de « Ça, c’est… » recommencé et de la première tentative de « La semaine dernière ». Application complète, undo et annulation pendant l’analyse contrôlés.
- Export réel de contrôle : MP4 complet, index moov placé avant mdat, plusieurs images clés rapprochées. Le format réserve son index sans garder tout le MP4 en mémoire sur les navigateurs disposant du stockage privé.
- Régressions : rognage, poignées et ripple, ordre et profondeur des pistes, duplication/gel, cache des masques, préréglages, animations, mixage et décalage audio, forme d’onde.

Les essais ont été exécutés sur PC dans Chromium. Le chargement tardif du modèle, le worker monofil et sa libération limitent la charge mobile ; aucune mesure matérielle sur Pixel 9 n’a été effectuée ici.


### 2.2.0 — 21 octobre 2026

- Branche de secours publiée avant modification :
  `backup/avant-modifications-2026-10-21` → `fea20c0`.
- Tests Node : `editor-220.cjs`, `popout.cjs`, `mobile-export.cjs`.
- Chromium : changement de piste B-roll par événements pointeur, maintien de la
  profondeur/heure et suivi du curseur ; repère aimanté et alignement exact.
- Clavier : Espace démarre/met en pause, flèches avancent/reculent, Backspace
  supprime la sélection et ne supprime aucun clip pendant la saisie.
- Auto zoom : interpolation 0→35 et 10→50, conservation des anciens réglages.
- Illustrer : fond à 125 %, X +10 %, Y −5 %, réglages restaurés dans le dialogue ;
  scène déplacée sur piste secondaire avec son fond.
- Fichier `.pocketcut` : sources binaires relues, médias remappés sans collision,
  nouveau projet restauré, annuler/rétablir testés, fichier tronqué/invalide rejeté.
- U²-NetP réel : photo de vélo avec alpha, préréglage du mode objet, puis vidéo
  synthétique d’un vélo mobile. Précalcul final et MP4 réellement produits.
  Inspection PyAV : H.264 Constrained Baseline, 720×1280, 30 i/s, 24 images,
  images clés 0/10/20. Caches humain/objet séparés.
- Régression : vrai sujet humain issu d’une vidéo source, masque final non vide
  avec fond transparent et personne conservée.
- Tests de navigateur sur PC ; pas de mesure sur un Pixel 9 physique.


### 2.2.1 — 22 octobre 2026

- Tests Node : mobile-export, export-color, editor-220, popout et restauration
  de projets. Conversion des niveaux noir/blanc/gris, dimensions et tampon borné.
- Source réelle HEVC 4K BT.709 full-range : comparaison HTMLVideo / CanvasSink,
  mêmes pixels sur l’image mesurée, sans décalage des canaux. La piste HDR ne
  s’applique pas à cette source SDR.
- Exports réels avec voix : mobile + Standard, 720×1280 et 1080×1920, 30 i/s.
  Inspection indépendante PyAV : Baseline / High, 60 images sur le test de 2 s,
  audio AAC ; primaires, transfert et matrice BT.709, niveaux limités. Mode mobile :
  images clés 0/10/20/30/40/50. Standard : image clé 0, intervalle demandé 2 s.
- Comparaison 720p au même rendu avant compression, première image : PSNR témoin
  33,65 dB ; nouveau mobile 37,30 dB ; Standard 37,32 dB. Ce chiffre décrit cet
  extrait de test, pas une garantie pour toutes les vidéos ou tous les appareils.
- Projet de test : timeline et historique inchangés après chaque export, fichier
  .pocketcut créé, fermeture/réouverture et annulations conservées. Stockage de
  production non modifié pendant ces vérifications, réalisées sur un autre port.
- Pas de test sur Pixel 9 physique. Les pixels des sources et des montages de
  l’utilisateur ne sont pas publiés dans le dépôt GitHub.
