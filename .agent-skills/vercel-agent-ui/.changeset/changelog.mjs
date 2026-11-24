import changelog from "@changesets/cli/changelog"

// A release names each internal package it moves to once, rather than once
// for every changeset behind that package's new version.
export default {
  ...changelog,
  getDependencyReleaseLine: (changesets, dependenciesUpdated) =>
    dependenciesUpdated
      .map(
        (dependency) =>
          `- Updated ${dependency.name} to ${dependency.newVersion}`
      )
      .join("\n"),
}
