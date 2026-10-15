# PocketCut · Projets, rognage et Android

Déposez tous les fichiers de ce dossier ensemble à la racine de votre site GitHub Pages. Aucun build, serveur applicatif, Python, compte ou clé API n’est nécessaire. Ouvrez l’adresse HTTPS de GitHub Pages. Vous pouvez aussi ouvrir index.html directement si votre navigateur autorise les CDN et les workers Blob depuis file://.

Le moteur IA et son modèle sont inclus dans assets/ai et chargés depuis votre site ; des CDN servent de secours. Les autres bibliothèques utilisent encore leurs CDN : Internet est nécessaire. Les fichiers importés, l’analyse, le montage et l’export restent dans votre navigateur. Il n’y a aucun téléversement de vos vidéos. Le projet, ses médias et son historique sont sauvegardés localement dans IndexedDB. Les masques de détourage restent en mémoire : ils sont recalculés après réouverture.

## Nouveautés version 17

**Projets** ouvre votre bibliothèque : donnez un nom, créez un nouveau montage ou revenez à un autre. Chaque projet conserve ses médias, réglages et son propre historique Annuler/Rétablir, même après rechargement. Les préréglages sont communs aux projets. L’ancien montage est migré sous « Mon premier montage ». Un changement de projet attend la sauvegarde du montage ouvert ; si elle échoue, le changement est interrompu.

**Rogner** ouvre un aperçu de la source avec huit poignées et un cadre déplaçable. Choisissez Libre, Original, Carré, Vertical 9:16, Paysage 16:9 ou Portrait 4:5. Les quatre côtés se règlent aussi numériquement. Réinitialiser récupère l’image entière. Le rognage est non destructif et conserve la pose, la rotation et les animations ; il est inclus dans les préréglages et l’export. Un ratio fixe est adapté aux dimensions du prochain média. L’aperçu de rognage présente la source sans sa rotation pour faciliter les réglages.

**Étirer/rétrécir un clip** : avec Aimant, ses poignées accrochent les extrémités des autres calques, le curseur et le début du montage. Un guide doré indique la cible. Alt suspend l’aimant sur ordinateur. Les limites du média et les clips voisins de la même rangée sont respectés. Le réglage manuel ne déplace pas automatiquement les autres clips.

**Android** : les transactions rouvrent automatiquement une connexion IndexedDB fermée et réessaient jusqu’à trois fois. Le moteur IA utilise un seul worker sur mobile pour réduire la mémoire utilisée ; « Réessayer IA » permet de relancer son chargement après une erreur. Le moteur, ses deux variantes WASM et le modèle sont fournis dans **assets/ai** : téléversez impérativement ce dossier avec tous les fichiers, sans changer leur organisation. L’archive est donc plus volumineuse. Aucun serveur applicatif n’est nécessaire.

La sauvegarde reste propre à chaque appareil, navigateur et adresse du site. Elle n’est pas synchronisée par GitHub. Conservez la même adresse pour retrouver vos projets. Ne videz pas les données du site pour appliquer cette mise à jour.

## Commandes

Sélectionnez un clip sur la timeline ou touchez directement son sujet dans l’aperçu avant d’utiliser un outil. Les deux rangées défilent horizontalement sur petit écran.

- **PIP IA** : crée une copie détourée centrée à pleine hauteur, son coupé. Maintenez 450 ms pour ouvrir position X/Y, zoom et rotation. Deux doigts permettent aussi de zoomer et tourner dans l’aperçu.
- **Détourer** : active/désactive immédiatement le détourage du clip sélectionné. Maintenez pour modifier Contour, Douceur et Qualité.
- **Animation** : applique immédiatement le pop-up de 0,25 s au clip détouré sélectionné. Maintenez pour changer sa durée, désactiver ou tester l’effet. L’entrée et la sortie suivent la rotation du calque. Le sujet commence hors de la scène, grandit jusqu’à votre pose, puis rétrécit en sortant. Les clips courts adaptent la durée.
- **Volume** : réglage immédiat de 0 à 400 % avec le curseur, jusqu’à 1000 % avec la valeur numérique. Un signal déjà fort peut saturer après amplification.
- **Mute** : coupe/rétablit le son. **Décalage son** : valeur positive = son retardé ; négative = son avancé. Le son reste dans la durée du clip et les bornes du média découpé. Lecture et export utilisent le même gain et décalage.
- **Keyframes** : placez le curseur, ajoutez un point, puis déplacez le curseur et réglez position, zoom ou rotation. Les valeurs sont interpolées. Le point au curseur devient plus grand et doré. Touchez un point pour le rejoindre ; maintenez-le 450 ms pour le supprimer (sur la timeline ou dans la liste). Le bouton « Supprimer la keyframe » agit sur le point sous le curseur. La suppression est annulable.
- **Auto-keyframes** : ouvre le zoom progressif. Modifier la valeur l’active immédiatement ; +15 % par défaut. La case permet de désactiver. Pour une fusion, le zoom couvre toute la capsule sans repartir de zéro entre les clips.
- **AutoCut** : conserve la dernière prise sonore détectée. **Diviser** : coupe au curseur ; avec l’aimant, si la coupe tombe dans un silence, ramène les extrémités à la fin et au début des plages sonores voisines. Une coupe à l’intérieur d’une plage sonore reste à votre position. La détection repose sur l’énergie du son, pas sur une transcription : musique et bruit peuvent aussi être détectés.
- **Fusionner** : touchez le bouton, puis les clips d’une même rangée, puis OK. Sélectionnez également les clips intermédiaires. Les portions sont réunies bout à bout en une seule capsule éditable, sans réencodage des médias. Le zoom du groupe couvre toute sa durée ; Mute, volume, décalage, changement de rangée et suppression concernent la capsule entière. Annuler permet de revenir avant la fusion.
- **Image PIP / Vidéo** : import local. Les calques ajoutés sont centrés ; les images et copies PIP occupent la hauteur de travail.

Un petit **+** dans le coin des outils PIP IA, Détourer et Animation signale leurs réglages par maintien. Un appui long n’exécute pas aussi le clic court. Sur ordinateur, clic droit ou Maj+Entrée ouvre également les réglages. Les valeurs dans les fenêtres s’appliquent immédiatement ; aucune étape « cocher puis appliquer ».

## Sauvegarde locale et préréglages

La sauvegarde est automatique après les modifications et les annulations/rétablissements. L’indicateur affiche « Enregistrement… », puis « Sauvegardé localement ». En revenant à la même adresse avec le même navigateur, le projet, les médias importés, le format, les réglages et l’historique complet sont restaurés. Une branche Rétablir reste disponible si vous aviez quitté après une annulation. Les formes d’onde compactes et les plages sonores sont conservées ; l’audio complet est décodé à la demande. Aucune réimportation des fichiers n’est nécessaire.

La sauvegarde appartient aux données de ce navigateur, pour cette adresse de site. Elle ne se synchronise pas sur un autre appareil. Effacer les données du site ou utiliser une session privée peut la supprimer. En cas de stockage plein ou bloqué, un message indique que les dernières modifications ne sont pas sauvegardées ; attendez l’indicateur de réussite avant de fermer. Les masques IA, qui peuvent être volumineux, sont recalculés à la réouverture.

**Mes préréglages** ouvre la bibliothèque locale. Sélectionnez le calque à mémoriser, donnez un nom et utilisez « Enregistrer le calque actuel ». Plus tard, sélectionnez un autre calque, choisissez le préréglage et cliquez « Appliquer au calque ». Vous pouvez renommer un préréglage avec le champ Nom et le bouton Renommer. Appliquer reste annulable dans le projet.

Un préréglage conserve position, hauteur affichée, rotation, rognage, keyframes, auto-zoom, pop-up, détourage vidéo, volume, mute et décalage audio. Les positions et hauteurs sont proportionnelles à la zone de travail ; le nouveau média garde son propre ratio. Les temps des keyframes et la durée du pop-up sont proportionnels à la durée cible. Un point placé au milieu d’un clip de dix secondes sera donc au milieu d’un clip de deux secondes. Le préréglage conserve les réglages, pas le fichier, les coupes ni l’emplacement du nouveau clip sur la timeline.

## Sélection dans l’aperçu

Un toucher choisit le calque visible à cet endroit, en tenant compte de la rotation, du rognage et des zones transparentes. Sur un PIP détouré, toucher le sujet sélectionne le PIP et sa capsule dans la timeline ; toucher le transparent permet d’atteindre le calque derrière. La rangée sélectionnée devient visible si nécessaire. Le premier doigt choisit le calque du geste, puis les deux doigts modifient ce même calque. Après avoir tapé un PIP, un pinch démarrant sur sa marge transparente conserve ce PIP ; pour modifier le fond, touchez-le d’abord ailleurs.

La disposition est conservée. Les surfaces passent au mauve et à l’orange brûlé ; les outils alternent vert, rouge, bleu, jaune, mauve et orange.

## Timeline et format

Glissez la souris ou le doigt sur la timeline pour la faire défiler. Un toucher immobile sélectionne un clip. Seule la sélection possède des poignées : elles sont en dehors du contenu, qui représente exactement la durée vidéo. Le curseur atteint la fin du montage et conserve la dernière image.

Les boutons **Format** et **Qualité** sont près d’Aimant et Exporter. Formats : vertical 9:16, paysage 16:9, carré 1:1, portrait 4:5. Annuler/Rétablir inclut le changement de format. Le format vertical est celui par défaut pour Shorts, Reels et TikTok.

## Précalcul et export

Le détourage précalcule un masque pour chaque véritable image source, y compris une cadence variable. Il réutilise ces masques pendant la lecture et l’export. Les pixels vidéo restent à la définition source. Déplacer, tourner, zoomer, fusionner ou animer ne refait pas le calcul. Raccourcir réutilise le cache ; rallonger calcule seulement les images manquantes. Modifier les paramètres de détourage invalide les masques.

Le pipeline fait l’analyse et la compression PNG dans 1 à 3 workers selon les cœurs annoncés par l’appareil : 1 sous 4 cœurs, 2 de 4 à 7, 3 à partir de 8. Le premier moteur est réutilisé. Aucun abaissement de la cadence ou de la définition d’analyse n’est ajouté pour accélérer. Cache PNG limité à 128 Mo, masques décodés limités à 16 par source.

Mesure de comparaison, navigateur de test de bureau, modèle déjà chargé : 30 images 720 × 1280, analyse équilibrée à 960 pixels sur le grand côté. Trois comparaisons : 1698 → 719 ms (58 %), 1731 → 702 ms (59 %), 1787 → 980 ms (45 %). Gain médian : 58 %, avec une variation de 45 à 59 %. Cette mesure concerne le précalcul, pas le téléchargement initial du modèle. Le gain varie selon le téléphone, les cœurs et la chauffe ; il n’est pas garanti à 50 % sur tous les appareils.

L’export MP4 H.264/AAC compose les images hors temps réel avec leurs horodatages. Définition source et cadence source par défaut ; option 1080p selon le format et 30/60 i/s. Aucun rabaissement silencieux d’une définition non prise en charge : un message demande un réglage compatible. WebCodecs et un navigateur récent sont nécessaires. Le modèle Selfie Segmenter détoure les personnes ; ce n’est pas un détourage universel d’objets et les détails fins restent tributaires du modèle.
