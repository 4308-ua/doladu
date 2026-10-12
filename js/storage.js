// Шар зберігання даних.
// Зараз дані лежать у браузері (localStorage). Коли з'явиться база даних
// (Supabase, Firebase тощо) — достатньо переписати load() і save() тут,
// решта застосунку нічого не помітить.
window.LP = window.LP || {};

(function (LP) {
  const KEY = 'life-planner.v1';

  LP.storage = {
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.error('Не вдалося прочитати дані', e);
        return null;
      }
    },

    save(data) {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        console.error('Не вдалося зберегти дані', e);
        alert('Не вдалося зберегти дані в браузері. Зроби експорт, щоб нічого не втратити.');
        return false;
      }
    },

    // Резервна копія у файл
    exportFile(data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'lad-' + LP.u.today() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },

    async readFile(file) {
      const text = await file.text();
      return JSON.parse(text);
    },
  };
})(window.LP);
