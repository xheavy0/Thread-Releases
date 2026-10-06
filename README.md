# Thread Releases

Official public downloads for the Thread ecosystem. Application source repositories remain private.

Download [Thread Toolbox](https://github.com/xheavy0/Thread-Releases/releases/latest) to install, launch, and update Windows apps.

## Applications

- [Threadforge](https://github.com/xheavy0/Thread-Releases/releases/tag/threadforge-v1.0.1)
- [Threadshot](https://github.com/xheavy0/Thread-Releases/releases/tag/threadshot-v0.1.10)
- [ThreadAccount](https://github.com/xheavy0/Thread-Releases/releases/tag/threadaccount-v0.3.0)
- [Threadlendar](https://github.com/xheavy0/Thread-Releases/releases/tag/threadlendar-v0.2.0)
- [ThreadStorage Android preview](https://github.com/xheavy0/Thread-Releases/releases/tag/threadstorageandroid-v0.1.0-preview)
- [ThreadStorage iOS preview](https://github.com/xheavy0/Thread-Releases/releases/tag/threadstorageios-v0.1.0-iphone-preview)

## Release layout

Toolbox releases use tags such as `v0.1.5` and retain the repository's Latest designation for self-updates. Each other app uses its own tag prefix. Windows packages include a Toolbox manifest with SHA256 checksums. Original release assets and preview flags are preserved.

[`releases.json`](releases.json) contains the shared catalog and current stable/preview releases. Toolbox reads this public index without a GitHub token or REST API request.

The former ThreadToolbox-Releases repository was renamed to this repository. Its historical releases and repository identity are preserved for existing Toolbox update URLs.

## Release retention

Each application keeps at most two published versions. A current stable version is retained when newer previews exist. Publishing a release automatically runs GitHub Actions to delete older public releases and their assets, refresh releases.json, and reserve Latest for the stable Toolbox updater. Private source history is unaffected. Unknown tags and drafts are left alone.

Threadlendar is not ready for public release. Its downloads are withdrawn and mirroring is disabled until the catalog enables it again.
