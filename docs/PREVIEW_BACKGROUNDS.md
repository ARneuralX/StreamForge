# Preview backgrounds

Overlay `?bg=...`, Build Studio and Widget Library previews use the same implementation in `public/dashboard/preview-backgrounds.js`. `npm run test:preview-backgrounds` samples rendered pixels for all five options on all three surfaces.

| Name | Exact preview surface |
| --- | --- |
| `dark` | `#17151f` |
| `bright` | `#f5f5f5` |
| `checker` | 24 × 24 px repeating conic tiles using `#777777` and `#ffffff` |
| `green` | `#00ff00` |
| `transparent` | transparent CSS background |

Build Studio and Library selections persist independently in local storage. Overlay preview selection is explicit in its URL, so a normal `/overlay/` browser source always starts transparent regardless of dashboard preview choices. The preview frame replaces the opaque widget gradient with a translucent solid theme background to keep text readable while allowing the selected surface to show through. A preview setting is never added to persisted overlay state or OBS URLs automatically.
