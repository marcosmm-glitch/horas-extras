import pathlib
r=lambda f: pathlib.Path(f).read_text()
html=f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Horas Extras">
<title>Horas Extras</title>
<style>{r('style.css')}</style>
</head>
<body>
<div id="app"></div>
<nav class="bot" aria-label="Seções"><div></div></nav>
<div id="toast" role="status" aria-live="polite"></div>
<div id="modal"><div class="box"></div></div>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
<script src="config.js"></script>
<script>{r('engine.js')}</script>
<script>{r('ui.js')}</script>
</body>
</html>'''
pathlib.Path('index.html').write_text(html)
