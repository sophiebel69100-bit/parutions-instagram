# Parutions Instagram · Sophie Bel

Claude dépose ici les visuels (`media/`) et le planning (`programmation.json`).
Le workflow n8n de Sophie lit ce planning toutes les 5 minutes et publie sur Instagram à l'heure prévue.

Champs d'une parution : `id` (unique), `date` (heure de Paris avec `+01:00`), `type` (`post`, `carrousel`, `reel`, `story`), `medias` (chemins dans `media/`), `legende`, `couverture` (reel, facultatif), `test` (true = vérifie sans publier).
