chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "unibridge-download-snapshot" || !sender.tab?.id) return;
  const payload = JSON.stringify(message.snapshot, null, 2);
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`;
  chrome.downloads.download(
    {
      url,
      filename: "UniBridgeAI-page-snapshot.json",
      saveAs: true,
    },
    (downloadId) => {
      const error = chrome.runtime.lastError;
      sendResponse(error ? { error: error.message } : { downloadId });
    },
  );
  return true;
});
