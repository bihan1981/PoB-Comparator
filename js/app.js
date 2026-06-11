/**
 * app.js — entry point, wires up the UI interactions.
 */
(function () {

  const compareBtn = document.getElementById('compareBtn');
  const masterInput = document.getElementById('masterInput');
  const mineInput = document.getElementById('mineInput');
  const leagueSelect = document.getElementById('leagueSelect');
  const clearBtn = document.getElementById('clearBtn');

  compareBtn.addEventListener('click', runCompare);
  clearBtn.addEventListener('click', clearAll);

  // Allow paste directly into the page (anywhere outside inputs) to fill the focused field
  masterInput.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) runCompare(); });
  mineInput.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) runCompare(); });

  async function runCompare() {
    const masterRaw = masterInput.value.trim();
    const mineRaw = mineInput.value.trim();

    if (!masterRaw || !mineRaw) {
      UI.showError('Please paste a PoB code (or pastebin URL) in both fields.');
      return;
    }

    UI.showLoading(true);
    try {
      const [masterBuild, mineBuild] = await Promise.all([
        PoBParser.fromInput(masterRaw),
        PoBParser.fromInput(mineRaw),
      ]);

      const result = PoBCompare.compare(masterBuild, mineBuild);
      const targetVersion = masterBuild.build.targetVersion;
      const league = leagueSelect.value;

      UI.render(result, league, targetVersion);
      document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      UI.showError('Error: ' + err.message);
      console.error(err);
    } finally {
      UI.showLoading(false);
    }
  }

  function clearAll() {
    masterInput.value = '';
    mineInput.value = '';
    document.getElementById('results').innerHTML = '';
  }

})();
