/**
 * Email domain suggestions — surfaced the moment "@" is typed,
 * narrowed as the guest continues. Arrow keys, Enter/Tab or touch to accept.
 */

const DOMAINS = [
  'gmail.com',
  'outlook.com',
  'icloud.com',
  'yahoo.com',
  'hotmail.com',
  'proton.me',
  'me.com',
  'live.com',
];

export function attachEmailSuggest(input, list) {
  let options = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    list.textContent = '';
    options = [];
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const highlight = (i) => {
    active = i;
    [...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) input.setAttribute('aria-activedescendant', list.children[i].id);
  };

  const accept = (i) => {
    const local = input.value.split('@')[0];
    input.value = `${local}@${options[i]}`;
    close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new CustomEvent('suggest:accept', { bubbles: true }));
  };

  const render = () => {
    const value = input.value;
    const at = value.indexOf('@');
    if (at < 1 || value.indexOf('@', at + 1) !== -1) return close();
    const local = value.slice(0, at);
    const typed = value.slice(at + 1).toLowerCase();
    options = DOMAINS.filter((d) => d.startsWith(typed) && d !== typed).slice(0, 5);
    if (!options.length) return close();

    list.textContent = '';
    options.forEach((domain, i) => {
      const li = document.createElement('li');
      li.id = `email-option-${i}`;
      li.setAttribute('role', 'option');
      li.append(document.createTextNode(`${local}@`));
      const b = document.createElement('b');
      b.textContent = domain;
      li.append(b);
      li.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        accept(i);
      });
      list.append(li);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(0);
  };

  input.addEventListener('input', (e) => {
    if (e.isTrusted || e.inputType) render();
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight((active + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight((active - 1 + options.length) % options.length); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0) { e.preventDefault(); accept(active); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
}
