// Social links for premierconnectai.com and foundusingai.premierconnectai.com (both load this one file).
// Adds an icon row to the page footer, if there is one, and a small chat bubble that opens once per visitor.
(function(){
  if (window.__pcSocial) return; window.__pcSocial = 1;
  var LINKS = [
    ['Instagram', 'https://www.instagram.com/premierconnect.ai/', '<path d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zm0 4.8a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zm5.2-9.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>'],
    ['LinkedIn', 'https://www.linkedin.com/in/demetri-panagiotou-719609267/', '<path d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.3V9h3.4v1.6c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM7.1 20.5H3.6V9h3.5v11.5zM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0z"/>'],
    ['X', 'https://x.com/demetripanagiot', '<path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4zm-1.2 17.9h1.9L7.1 4.2H5.1L17 20.2z"/>']
  ];
  function icons(cls){
    return LINKS.map(function(l){
      return '<a class="'+cls+'" href="'+l[1]+'" target="_blank" rel="noopener me" aria-label="PremierConnect AI on '+l[0]+'"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">'+l[2]+'</svg><span>'+l[0]+'</span></a>';
    }).join('');
  }

  var css = document.createElement('style');
  css.textContent =
    '.pcs-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;width:100%}' +
    '.pcs-row b{font-weight:500}' +
    '.pcs-a{display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none}' +
    '.pcs-a:hover{text-decoration:underline}' +
    '.pcs-near{position:relative;margin-top:28px;display:flex;flex-direction:column;gap:12px;font-size:15px;opacity:.95}' +
    'section.close .pcs-near{align-items:center;text-align:center}' +
    '.pcs-near div{display:flex;flex-wrap:wrap;gap:10px}' +
    '.pcs-pill{padding:9px 14px;border:1px solid currentColor;border-color:color-mix(in srgb,currentColor 35%,transparent);border-radius:999px;font-weight:500}' +
    '.pcs-pill:hover{text-decoration:none;border-color:currentColor}' +
    '.pcs-btn{position:fixed;right:18px;bottom:18px;z-index:9998;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;background:#0b5fff;color:#fff;box-shadow:0 8px 24px rgba(10,30,80,.28);display:flex;align-items:center;justify-content:center}' +
    '.pcs-btn:focus-visible,.pcs-card a:focus-visible,.pcs-x:focus-visible{outline:3px solid #9cc0ff;outline-offset:2px}' +
    '.pcs-card{position:fixed;right:18px;bottom:86px;z-index:9999;width:min(320px,calc(100vw - 36px));background:#fff;color:#14181f;border-radius:16px;box-shadow:0 18px 48px rgba(10,30,80,.25);padding:16px 16px 14px;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .2s,transform .2s}' +
    '.pcs-card.open{opacity:1;transform:none;pointer-events:auto}' +
    '.pcs-card p{margin:0 28px 12px 0}' +
    '.pcs-who{display:block;font-size:13px;color:#5b6472;margin-bottom:6px}' +
    '.pcs-card .pcs-a{display:flex;padding:10px 12px;border:1px solid #e3e6eb;border-radius:10px;margin-top:8px;font-weight:500}' +
    '.pcs-card .pcs-a:hover{background:#f3f6fb;text-decoration:none}' +
    '.pcs-x{position:absolute;top:8px;right:8px;width:32px;height:32px;border:0;background:none;font-size:22px;line-height:1;color:#5b6472;cursor:pointer;border-radius:8px}' +
    '@media (max-width:700px){.pcs-row{padding-right:64px;box-sizing:border-box}' +
      // FoundusingAI on a phone: the scan button owns the bottom corner, so the bubble goes top right.
      '.pcs-top.pcs-btn{top:40px;bottom:auto;right:12px;width:44px;height:44px}.pcs-top.pcs-card{top:92px;bottom:auto;right:12px}}' +
    '@media print{.pcs-btn,.pcs-card{display:none}}';
  document.head.appendChild(css);

  // Footer row: every footer on the main site, nothing on pages without one.
  var footers = document.querySelectorAll('footer');
  for (var i = 0; i < footers.length; i++) {
    var row = document.createElement('span');
    row.className = 'pcs-row';
    row.innerHTML = '<b>Follow along:</b>' + icons('pcs-a');
    footers[i].appendChild(row);
  }

  // Under the page's closing call to action: the homepage's "Book a 60-minute call" line, else the last .cta.
  var ctas = document.querySelectorAll('section.close .talk, main .cta');
  var cta = document.querySelector('section.close .talk') || ctas[ctas.length - 1];
  if (cta) {
    var near = document.createElement('div');
    near.className = 'pcs-near';
    near.innerHTML = '<span>Want to learn more? Follow along:</span><div>' + icons('pcs-a pcs-pill') + '</div>';
    cta.parentNode.insertBefore(near, cta.nextSibling);
  }

  // Chat bubble
  var card = document.createElement('div');
  card.className = 'pcs-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Follow PremierConnect AI');
  card.innerHTML =
    '<button type="button" class="pcs-x" aria-label="Close">&times;</button>' +
    '<span class="pcs-who">Demetri, PremierConnect AI</span>' +
    '<p>If you want to learn more, here are my social accounts. There is a lot of great knowledge on them, and you will get real value out of it.</p>' +
    icons('pcs-a');
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pcs-btn';
  btn.setAttribute('aria-label', 'Follow PremierConnect AI on social');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.4 1.1 4.6 3 6.2L4 22l4.6-2.4c1.1.3 2.2.5 3.4.5 5.5 0 10-3.9 10-8.7S17.5 3 12 3z"/></svg>';
  if (location.hostname.indexOf('foundusingai') === 0) { card.classList.add('pcs-top'); btn.classList.add('pcs-top'); }
  document.body.appendChild(card);
  document.body.appendChild(btn);

  function set(open){
    card.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (!open) try { localStorage.setItem('pc-social-seen', '1'); } catch (e) {}
  }
  btn.onclick = function(){ set(!card.classList.contains('open')); };
  card.querySelector('.pcs-x').onclick = function(){ set(false); btn.focus(); };
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && card.classList.contains('open')) set(false); });

  // Opens by itself once, 12 seconds in, then never again for that visitor.
  var seen = false; try { seen = localStorage.getItem('pc-social-seen') === '1'; } catch (e) {}
  if (!seen) setTimeout(function(){ if (!card.classList.contains('open')) { card.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); try { localStorage.setItem('pc-social-seen', '1'); } catch (e) {} } }, 12000);
})();
