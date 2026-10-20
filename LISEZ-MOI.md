# PocketCut Studio — Version 2

Cette V2 part de la dernière version de PocketCut (désormais V1). Elle ajoute un montage guidé par la narration et des scènes liées. Aucun code de Concat n’a été repris.

## Publier et garder la V1

Pour mettre à jour une V2 existante, remplacez ses fichiers au même emplacement. Sur le dépôt montageVideo, gardez les fichiers à la racine : ne créez pas un nouveau dossier pour cette mise à jour, afin de retrouver les projets locaux à la même adresse. Une V1 conservée séparément peut rester dans son propre dossier. Le site est statique : aucun serveur personnel ni commande à lancer. Internet sert au chargement des bibliothèques CDN ; vos vidéos restent traitées et sauvegardées dans le navigateur.

Le dossier `assets/ai/` doit être publié avec les autres fichiers. Gardez le chemin de publication de la V2 stable : les sauvegardes sont locales au navigateur, à l’origine et au dossier du site.

La V2 utilise un stockage distinct, même si elle est publiée au même chemin que la V1. Les projets et préréglages V1 ne sont pas importés automatiquement ; ils restent dans la V1. Les compositions V2 sont disponibles entre tous les projets V2 du même navigateur et de la même adresse. Il n’y a pas de synchronisation automatique PC/Android.

## Le parcours rapide

1. **Prises** : importer vos vidéos, classées de la plus ancienne à la plus récente.
2. **AutoCut** : conserve la dernière prise en recherchant les débuts de phrases recommencés. La première utilisation télécharge un modèle de voix ; le calcul se fait sur cet appareil, dans un worker à un seul fil. Maintenir ouvre les options et l’analyse avant application. La reconnaissance peut se tromper : les coupes sont annulables et l’option peut être désactivée. Si le modèle est indisponible, le logiciel annonce le repli vers la détection sonore.
3. Sélectionner un clip principal ou plusieurs, puis **Illustrer**. Les champs Début/Fin permettent de choisir une plage à la seconde près, même à l’intérieur d’un clip.
4. Choisir une image ou une vidéo dans les médias du projet, ou l’importer directement dans cette fenêtre.
5. Choisir une présentation, un placement et appliquer.

Les quatre présentations :

- **Fond + moi détouré** : narration au premier plan, détourage activé ; fond cadré avec zoom progressif de 100 à 135 %, pop-up d’entrée et sortie de 0,25 s par défaut. Les paramètres sont modifiables. Placements droite/gauche inclinés, centre et réaction grand format.
- **Écran partagé** : narration cadrée dans la moitié haute, illustration dans la moitié basse ; aucun détourage nécessaire. Le visage occupe une bande de 30 % en haut et le visuel zoomé occupe les 70 % restants. Le cadrage vertical du visage et la hauteur de cette bande sont réglables dans Cadrage et audio.
- **Extrait seul** : seule l’illustration est visible. Vous pouvez conserver votre narration, écouter l’extrait ou les deux selon les cases audio.
- **Face caméra** : retirer l’illustration et retrouver le cadrage du clip avant sa mise en scène.

Une illustration vidéo plus courte que le passage peut boucler ou geler sa dernière image. Un gel est silencieux. L’audio du fond est coupé par défaut ; votre voix n’est pas dupliquée.

## Les scènes sont liées à la narration

Le ruban au-dessus de la timeline montre les scènes. Touchez une scène pour modifier son fond, ses paramètres ou sa présentation. Le fond est calculé à partir de la scène, sans ajouter un clip indépendant qu’il faudrait recaler à la main.

Diviser, raccourcir, réordonner ou nettoyer la narration entraîne l’illustration avec elle. Une coupe technique à l’intérieur d’une même scène ne relance pas l’entrée pop-up ni le zoom du fond. Si les morceaux d’une scène sont séparés par d’autres passages, ils deviennent des apparitions distinctes.

L’option **Continuer le PIP précédent si sa pose est identique** permet de garder le sujet présent entre deux scènes voisines, sans nouveau pop-up. Position, dimensions et rotation doivent correspondre. Chaque fond conserve son propre zoom.

Les clips gardent leur source et leurs temps source : la voix et la personne détourée sautent ensemble aux mêmes endroits après un AutoCut. Le zoom du fond suit la durée de la scène remontée. Les masques IA sont partagés par média et temps source ; modifier le fond ou la pose ne relance pas l’analyse. Seuls les passages effectivement marqués pour le détourage sont préparés, pas la totalité du tournage.

## Compositions personnelles

Après avoir appliqué une scène, déplacez, zoomez ou tournez le sujet avec vos doigts, ou avec **Modifier clip** dans **Tous les outils**. Rouvrez **Illustrer**, donnez un nom dans **Mes compositions**, puis enregistrez la scène sélectionnée.

Une composition mémorise la présentation, le cadrage du fond, les réglages d’animation, d’audio et la pose du sujet avec ses keyframes et son rognage. Elle n’impose pas le même fichier d’illustration : choisissez votre nouveau média, chargez une composition puis appliquez. Positions et temps de keyframes s’adaptent au format et à la durée du passage. La durée relative du pop-up d’une composition peut donc varier avec la longueur du nouveau passage ; la valeur de 0,25 s est celle de la création d’une scène par défaut.

## Nettoyage prudent

**AutoCut classique**, par défaut, garde le dernier bloc parlé, avec 0,08 s avant et 0,15 s après. Le bouton agit directement, comme dans la V1.

L’option **Retirer les silences** conserve tous les blocs parlés détectés et garde, par défaut, 0,08 s avant et 0,15 s après. Les pauses intérieures suffisamment longues sont retirées ; les pauses plus courtes sont gardées. Le seuil de pause est réglable à partir de 0,6 s. Sans voix détectée, le clip reste intact.

**Dernier bloc parlé**, utilisé par le mode classique, peut supprimer des paroles valides et ne sait pas reconnaître la meilleure prise. La détection utilise le niveau sonore, pas une transcription ni une compréhension des phrases.

Les propositions affichent les intervalles conservés et la durée retirée. **Écouter l’original** sert à vérifier le contenu avant de valider ; ce bouton ne joue pas un montage provisoire des coupes. Après application, **Annuler** et **Rétablir** restent disponibles, y compris après réouverture du projet.

## Outils avancés et export

**Tous les outils** retrouve les fonctions de la V1 : PIP manuel, rognage, volume et décalage son, calques visuels, déplacement, division, duplication, gel, multisélection, keyframes, fusion et préréglages de clip. Les compositions de scène sont séparées de ces préréglages de clip.

Les sauvegardes de projets et les médias restent locaux. L’export MP4 H.264/AAC utilise la même composition de scène que l’aperçu, image par image. Le détourage final de la V1 est conservé ; cette V2 ne remplace pas le modèle IA et ne garantit pas une segmentation parfaite de toutes les scènes.

## Vérifications et limites

Tests de scènes, coupes, continuité, sources audio, animations, crop, duplication, gel et stockage. Test navigateur avec une vidéo de contrôle, masque IA réel, nettoyage de silences, changement de projet, réouverture et export MP4 redécodé. Détails dans VERIFICATIONS.md.

L’affichage mobile est vérifié dans le navigateur sur PC ; aucun Pixel 9 physique n’est accessible pour certifier les longues sessions ou les projets de plusieurs gigaoctets. Les bibliothèques et codecs dépendent du navigateur ; utilisez une version récente de Chrome Android en HTTPS.


## Version 2.0.1

Six placements : bas gauche/droite inclinés, haut gauche/droite inclinés (sujet retourné pour entrer depuis le haut), bas gauche/droite droits. La tranche coupée du bas de la source est ancrée hors du cadre après rotation. Les anciens placements par défaut sont corrigés lors de la réouverture ; les poses manuelles avec keyframes ne sont pas réinitialisées.

Le zoom par défaut du fond est de 35 %. Les scènes et compositions dont le zoom a déjà été enregistré conservent leur valeur.

La galerie du projet propose Ajouter et des vignettes avec badges « Déjà importé » ou « Utilisé · n ». Ajouter ouvre le sélecteur photo/vidéo du téléphone, sans imposer la caméra. Android ne permet pas d’injecter nos badges dans sa propre galerie système. Une sélection présentant le même nom, la même taille et la même date que le fichier déjà importé réutilise sa source ; une nouvelle utilisation dans la timeline peut être créée sans recopier le média. Les badges sont locaux au projet ouvert.


## Version 2.1.0

- Projets : choix Créer, Modifier et Supprimer, avec confirmation nominative avant suppression. Les projets existants et le nom du stockage sont conservés. Le dossier de publication ne doit pas changer.
- Auto zoom : de la taille posée (0 % d’augmentation) au pourcentage choisi, sur toute la durée du clip ou du groupe. 15 % par défaut.
- Illustrer : sujet par défaut environ 12 % plus grand pour les placements de coin ; les poses existantes restent conservées. Le pop-out rétrécit avant de sortir selon la rotation choisie.
- Galerie d’Illustrer : sujet sélectionné détouré et fonds image/vidéo, sans la liste des autres prises de narration.
- Export : images clés toutes les dix images à 30 i/s et index MP4 placé au début, pour faciliter les retouches mobiles. L’ouverture directe en fichier local utilise un export en mémoire si le stockage privé du navigateur est inaccessible.
- AutoCut : modèle multilingue Whisper base quantifié, chargé via [Transformers.js](https://huggingface.co/docs/transformers.js/api/pipelines). Les données audio ne sont pas envoyées à un service de transcription. Les mots reconnus sont sauvegardés avec le média pour éviter de refaire le calcul. L’annulation ne modifie pas la timeline ; le worker est libéré après une minute d’inactivité.

Les fichiers `take-recognition.js` et `take-speech-worker.js` doivent être publiés avec le reste du dossier. Aucune installation ni serveur personnel n’est nécessaire. Les CDN et le téléchargement initial du modèle nécessitent Internet.
