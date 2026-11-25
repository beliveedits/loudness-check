// Opens the tool in a tab when the toolbar icon is clicked. No permissions are needed.
chrome.action.onClicked.addListener(function () {
  chrome.tabs.create({ url: chrome.runtime.getURL('tool.html') });
});
