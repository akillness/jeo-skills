import "@ui-sdk/web/scroll-area"

const releases = [
  {
    version: "v1.12.0",
    date: "Oct 28, 2026",
    status: "Latest",
    downloads: "18,204",
    size: "4.3 MB",
    node: "20+",
  },
  {
    version: "v1.11.2",
    date: "Oct 14, 2026",
    status: "Stable",
    downloads: "26,931",
    size: "4.2 MB",
    node: "20+",
  },
  {
    version: "v1.11.1",
    date: "Oct 2, 2026",
    status: "Stable",
    downloads: "9,412",
    size: "4.2 MB",
    node: "20+",
  },
  {
    version: "v1.11.0",
    date: "Sep 23, 2026",
    status: "Stable",
    downloads: "31,077",
    size: "4.2 MB",
    node: "20+",
  },
  {
    version: "v1.10.3",
    date: "Sep 9, 2026",
    status: "Stable",
    downloads: "12,640",
    size: "4.1 MB",
    node: "18+",
  },
  {
    version: "v1.10.2",
    date: "Aug 27, 2026",
    status: "Stable",
    downloads: "8,315",
    size: "4.1 MB",
    node: "18+",
  },
  {
    version: "v1.10.1",
    date: "Aug 18, 2026",
    status: "Stable",
    downloads: "5,902",
    size: "4.1 MB",
    node: "18+",
  },
  {
    version: "v1.10.0",
    date: "Aug 5, 2026",
    status: "Stable",
    downloads: "22,486",
    size: "4.0 MB",
    node: "18+",
  },
  {
    version: "v1.9.4",
    date: "Jul 21, 2026",
    status: "Deprecated",
    downloads: "3,118",
    size: "3.9 MB",
    node: "18+",
  },
  {
    version: "v1.9.3",
    date: "Jul 8, 2026",
    status: "Deprecated",
    downloads: "2,764",
    size: "3.9 MB",
    node: "18+",
  },
  {
    version: "v1.9.2",
    date: "Jun 24, 2026",
    status: "Deprecated",
    downloads: "1,950",
    size: "3.9 MB",
    node: "18+",
  },
  {
    version: "v1.9.1",
    date: "Jun 10, 2026",
    status: "Deprecated",
    downloads: "1,208",
    size: "3.8 MB",
    node: "18+",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-scroll-area type="auto">
      <ui-scroll-area-viewport role="region" aria-label="Releases">
        <ui-scroll-area-content>
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Released</th>
                <th>Status</th>
                <th>Downloads</th>
                <th>Size</th>
                <th>Node</th>
              </tr>
            </thead>
            <tbody>
              ${releases
                .map(
                  (release) => `
                    <tr>
                      <th scope="row">${release.version}</th>
                      <td>${release.date}</td>
                      <td>${release.status}</td>
                      <td>${release.downloads}</td>
                      <td>${release.size}</td>
                      <td>${release.node}</td>
                    </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </ui-scroll-area-content>
      </ui-scroll-area-viewport>
      <ui-scroll-area-scrollbar>
        <ui-scroll-area-thumb></ui-scroll-area-thumb>
      </ui-scroll-area-scrollbar>
      <ui-scroll-area-scrollbar orientation="horizontal">
        <ui-scroll-area-thumb></ui-scroll-area-thumb>
      </ui-scroll-area-scrollbar>
      <ui-scroll-area-corner></ui-scroll-area-corner>
    </ui-scroll-area>
  `
}

export { mount }
