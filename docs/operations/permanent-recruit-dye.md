# Permanent Recruit dye bundle

`store_tutorial_dye_bundle_openbeta` is a permanent, free shop offer. It is listed
in Supplies and Dyes, survives the curated catalogue filter, and is excluded from
weekly selection and manual seed refreshes. It has no availability deadline.
Other offers retain their existing rotation and prices.

The bundle explicitly grants Lagoon, Sapling and Sandstone dyes plus
`TOKEN_STORE_TUTORIAL_DYE_BUNDLE`. This is the project's starter palette, not a
claim that retail bundle contents were recovered. The owned 1.4.4 client provides
the SKU/art row and proves that `Tutorial_Store_Quest` checks that exact token
using `ECollectItemRequirement::PossessAndCollect`. Dye ownership alone does not
meet that condition. The grant uses the existing audited store transaction; it
does not directly edit quest progression. Players who already own the dyes can
still claim their missing quest receipt without duplicating their dyes.

The new regression check covers 104 weekly windows, three rotation seeds, both
catalogue profiles, free pricing with Rams mode enabled, purchase retries, and
players who already own all three dyes. The targeted store/layout suite passed
58 tests, and the production TypeScript build passed. Live verification reads
the authenticated listing and SKU endpoints without making player purchases.
