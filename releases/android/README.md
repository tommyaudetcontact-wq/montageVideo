# Distribution Android

Le site `android.html` permet de télécharger l’APK. `latest.json` est aussi le
flux de mise à jour de l’application, vérifié au lancement (au plus toutes les
six heures), ou avec le bouton « Mises à jour ».

Pour une nouvelle version : augmenter `versionCode` et `versionName`, compiler
avec la même clé, puis lancer `tools/publish-android.py APK --build-tools CHEMIN
--notes "Changements"`. Ce script vérifie la signature, le paquet et l’alignement,
copie le fichier et produit le manifeste avec taille et SHA-256. Publier les deux
ensemble par commit Git. Ne jamais publier la clé privée. Garder l’ancien APK
disponible si une application est en train de le télécharger.

L’application accepte uniquement son paquet, une version plus récente, le chemin
HTTPS de distribution fixé dans le code, la taille et le SHA-256 attendus et la
signature de l’installation actuelle. Les redirections sont refusées. Le fichier
est téléchargé dans un cache privé, puis partagé uniquement à l’installateur
Android. Le projet doit être sauvegardé avant d’ouvrir l’installation.

Les versions Test 1 et Test 2 doivent être mises à jour manuellement une première
fois : elles ne possèdent pas ce système. Installer par-dessus, sans désinstaller.
Android garde la confirmation finale de chaque installation. Les projets et
l’origine locale WebView restent identiques.

Documentation Android : https://developer.android.com/studio/publish
