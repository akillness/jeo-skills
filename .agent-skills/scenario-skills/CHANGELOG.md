# Changelog

## [0.62.0](https://github.com/scenario-labs/skills/compare/skills-v0.61.0...skills-v0.62.0) (2026-11-11)


### Features

* **scenario-model-training:** teach MiniMax H3 video LoRA training ([#414](https://github.com/scenario-labs/skills/issues/414)) ([2e1f272](https://github.com/scenario-labs/skills/commit/2e1f272919778b3c67dd60772bf8bf18bea50823))
* **scenario-playable-ads:** start from an idea or a genre name ([#410](https://github.com/scenario-labs/skills/issues/410)) ([0afcbaa](https://github.com/scenario-labs/skills/commit/0afcbaa2bca4dd9d5b294609726ce50c89588f07))
* **scenario-task-tracking:** bill work to the task the user chose ([#382](https://github.com/scenario-labs/skills/issues/382)) ([11e4097](https://github.com/scenario-labs/skills/commit/11e409705a0505b9cab21206ef8ec7f327e82e61))


### Bug Fixes

* **scenario-asset-analysis:** find team assets by tag through search ([#409](https://github.com/scenario-labs/skills/issues/409)) ([a5441ad](https://github.com/scenario-labs/skills/commit/a5441ad444058d6e9c56945159ee19576b6b99e0))
* **scenario-model-training:** let upload_images take any id count ([2e1f272](https://github.com/scenario-labs/skills/commit/2e1f272919778b3c67dd60772bf8bf18bea50823))
* **scenario:** diagnose Claude connectors saved without /mcp ([#408](https://github.com/scenario-labs/skills/issues/408)) ([f3aa03f](https://github.com/scenario-labs/skills/commit/f3aa03f0752e63bc4f6a631ca39adaa872283c6f))
* **scenario:** map recommend's missing-prompt error to its fix ([#412](https://github.com/scenario-labs/skills/issues/412)) ([7ca28d6](https://github.com/scenario-labs/skills/commit/7ca28d6d388220d33cdc5635e601d43f2920b2ca))
* **scenario:** send CU-left questions to consumption_limit_get ([#411](https://github.com/scenario-labs/skills/issues/411)) ([6c0ec3d](https://github.com/scenario-labs/skills/commit/6c0ec3dd00b0f7293def6d1596f2457b451bf46d))

## [0.61.0](https://github.com/scenario-labs/skills/compare/skills-v0.60.1...skills-v0.61.0) (2026-11-08)


### Features

* **scenario-blender-blockout:** add a bicycle kind and a rider recipe ([#315](https://github.com/scenario-labs/skills/issues/315)) ([d12e237](https://github.com/scenario-labs/skills/commit/d12e237c7fbdb5ac15024252af0b4b327997f770))
* **scenario-comic-creator:** add comic creation skill ([#353](https://github.com/scenario-labs/skills/issues/353)) ([7cde6f7](https://github.com/scenario-labs/skills/commit/7cde6f7c8434f6468c3b3c304065a2defce97273))
* **scenario-game-ua-ads:** add mobile game UA ad skill ([#363](https://github.com/scenario-labs/skills/issues/363)) ([f38c3e8](https://github.com/scenario-labs/skills/commit/f38c3e8995a2a31681f37ef0039435a89f54f5ef))
* **scenario-kinetic-film:** add kinetic-type launch films and teasers ([#338](https://github.com/scenario-labs/skills/issues/338)) ([adc5af0](https://github.com/scenario-labs/skills/commit/adc5af00c86754a2afe16b7e4cc7e688f5fdab0c))
* **scenario-kinetic-music-video:** add a 4K master and motion blur ([#337](https://github.com/scenario-labs/skills/issues/337)) ([8e63f9a](https://github.com/scenario-labs/skills/commit/8e63f9a991c41ea362e5b136f1dc11656013f543))
* **scenario-kinetic-music-video:** gate renders on per-section dynamism ([#336](https://github.com/scenario-labs/skills/issues/336)) ([e7e19d5](https://github.com/scenario-labs/skills/commit/e7e19d5f7cf14f3b84a16a261dfb6f77724bd637))
* **scenario-playable-ads:** add playable ads skill ([#354](https://github.com/scenario-labs/skills/issues/354)) ([754d1ce](https://github.com/scenario-labs/skills/commit/754d1ceea270f1bf59651671b3471f385a5a80f9))
* **scenario-video-editing:** teach reworking a finished video ([#347](https://github.com/scenario-labs/skills/issues/347)) ([a4a8409](https://github.com/scenario-labs/skills/commit/a4a8409b546f03e248ac52fb98507a35864fd900))


### Bug Fixes

* **scenario-3d:** correct the Tripo pbr defaults ([#404](https://github.com/scenario-labs/skills/issues/404)) ([a8520cc](https://github.com/scenario-labs/skills/commit/a8520cc6ea6b2327a1fcaaa55c5b58b7cc30d6d0))
* **scenario-3d:** keep plain-background references as they are ([#348](https://github.com/scenario-labs/skills/issues/348)) ([f2d38db](https://github.com/scenario-labs/skills/commit/f2d38db44e8981b89bb7784676f038348462d58f))
* **scenario-3d:** prefer plain-background shots of glossy subjects ([#392](https://github.com/scenario-labs/skills/issues/392)) ([6a51de2](https://github.com/scenario-labs/skills/commit/6a51de2113056a5848a9157411478c37a40d40c0))
* **scenario-admin-analytics:** guard tab and CR led CSV cells ([#397](https://github.com/scenario-labs/skills/issues/397)) ([21e1afa](https://github.com/scenario-labs/skills/commit/21e1afadbe90b59337d5982f31bbeb6891bad600))
* **scenario-blender-blockout:** a brief's shot count overrides shots ([#383](https://github.com/scenario-labs/skills/issues/383)) ([bf08a74](https://github.com/scenario-labs/skills/commit/bf08a746530ea87b160ee9555a36b008d59cc8bc)), closes [#305](https://github.com/scenario-labs/skills/issues/305)
* **scenario-blender-blockout:** use K.REAR_RED for rear markers in example 2 ([#306](https://github.com/scenario-labs/skills/issues/306)) ([#377](https://github.com/scenario-labs/skills/issues/377)) ([f97b34e](https://github.com/scenario-labs/skills/commit/f97b34e726356b80f55666ea696cde36a3c9fa5c))
* **scenario-blender-expert:** count parts that cross face to face as touching ([#345](https://github.com/scenario-labs/skills/issues/345)) ([3590932](https://github.com/scenario-labs/skills/commit/3590932e327a4dd1f52d606576b5006b313002f9))
* **scenario-blender-export:** export web without meshopt before 5.2 ([#388](https://github.com/scenario-labs/skills/issues/388)) ([202c51f](https://github.com/scenario-labs/skills/commit/202c51fcb73075030bf6b8d1a4661a6b37959f01))
* **scenario-chatgpt-pet-create:** check pixel.json before reading it ([#398](https://github.com/scenario-labs/skills/issues/398)) ([bcd35c5](https://github.com/scenario-labs/skills/commit/bcd35c553d978cee35d31d1871a30003f82c5722))
* **scenario-game-ua-ads:** handle off-zone tap targets and masked props ([#393](https://github.com/scenario-labs/skills/issues/393)) ([632436a](https://github.com/scenario-labs/skills/commit/632436ae44057879bbb518499df6e74b73f2dd8d))
* **scenario-kinetic-music-video:** fade subtitle words, fix edge cases ([#395](https://github.com/scenario-labs/skills/issues/395)) ([b648ebe](https://github.com/scenario-labs/skills/commit/b648ebe8d203f2dfcc5597157d36beba7005a653))
* **scenario-kinetic-music-video:** harden serve, render and still ([#394](https://github.com/scenario-labs/skills/issues/394)) ([efbe737](https://github.com/scenario-labs/skills/commit/efbe7370f39a380db1a381b9dd668f61584876bb))
* **scenario-playable-ads:** end the round at the goal, fix t=0 throttle ([#396](https://github.com/scenario-labs/skills/issues/396)) ([04988b5](https://github.com/scenario-labs/skills/commit/04988b52d39ff66d6ec3b6e9a0266ebcec372378))
* **scenario-playable-ads:** stop paying for sound variants ([#405](https://github.com/scenario-labs/skills/issues/405)) ([ac71d38](https://github.com/scenario-labs/skills/commit/ac71d383c1fe149cd78864143fca0021c24aeb80))
* **scenario-sprite-animation:** flag frozen clips with a finite score ([#399](https://github.com/scenario-labs/skills/issues/399)) ([292e974](https://github.com/scenario-labs/skills/commit/292e97495141cc12fad74c9ea5bfd3959f70b81f))
* **scenario-sprite-animation:** lock one palette across pixel frames ([#351](https://github.com/scenario-labs/skills/issues/351)) ([b598d94](https://github.com/scenario-labs/skills/commit/b598d949d314ffcd69f0f77055becc81fd6bf4ae))
* **scenario-video-color-grade:** fade the end card credit in ([#400](https://github.com/scenario-labs/skills/issues/400)) ([87e8862](https://github.com/scenario-labs/skills/commit/87e886297b22d1f694da37b91d1e40836de23ed1))
* **scenario-workflow-authoring:** document the sticky note data contract ([#374](https://github.com/scenario-labs/skills/issues/374)) ([dc7b262](https://github.com/scenario-labs/skills/commit/dc7b262a20666a20285955b7f5f0faf63f305c8a))
* **scenario:** name the discovery arguments agents leave out ([#403](https://github.com/scenario-labs/skills/issues/403)) ([51de5d7](https://github.com/scenario-labs/skills/commit/51de5d76388327d2e31d64b184df2312131be99c))
* **scenario:** reuse the pair a write tool's scope refusal names ([#401](https://github.com/scenario-labs/skills/issues/401)) ([d4d1800](https://github.com/scenario-labs/skills/commit/d4d180077c3463d1448f10f96dc914dcf681bb30))
* **scenario:** say that a team is the organization when resolving scope ([#350](https://github.com/scenario-labs/skills/issues/350)) ([bac5061](https://github.com/scenario-labs/skills/commit/bac506171641271edc981dffa83d3a8a873457c1))
* **scenario:** show the catalog executor's call shape ([#402](https://github.com/scenario-labs/skills/issues/402)) ([bc5dbb7](https://github.com/scenario-labs/skills/commit/bc5dbb7842e2ee7088ccb56a4b65df8ff2331b8a))
* **scenario:** stop on a 429 before the next model_run ([#349](https://github.com/scenario-labs/skills/issues/349)) ([77f68b8](https://github.com/scenario-labs/skills/commit/77f68b872f6f2d0d101466c11da03549b59f8114))
* **skills:** close the file handles skill scripts left open ([#368](https://github.com/scenario-labs/skills/issues/368)) ([340a715](https://github.com/scenario-labs/skills/commit/340a715e3424c54b46a799980ee80f3075530fea))


### Documentation

* **docs:** require Node 22.18 and document Windows symlinks ([#361](https://github.com/scenario-labs/skills/issues/361)) ([3f397a5](https://github.com/scenario-labs/skills/commit/3f397a5abb4da500da3d9c8c7b60a7e603429c0b))
* **scenario:** stop calling asset_download write-class ([#341](https://github.com/scenario-labs/skills/issues/341)) ([5d68b48](https://github.com/scenario-labs/skills/commit/5d68b48b70db3388e1ac3e064810d72d8fc3f7ac))

## [0.60.1](https://github.com/scenario-labs/skills/compare/skills-v0.60.0...skills-v0.60.1) (2026-10-29)


### Bug Fixes

* **skills:** drop unversioned installs and pin the kinetic setup ([#340](https://github.com/scenario-labs/skills/issues/340)) ([b8544b9](https://github.com/scenario-labs/skills/commit/b8544b9c86e0685844cc6effbb27f3885f744d3a))


### Documentation

* **agents:** point skill-development at its new upstream home ([b8544b9](https://github.com/scenario-labs/skills/commit/b8544b9c86e0685844cc6effbb27f3885f744d3a))
* **docs:** list the setup prerequisites, uv included ([#335](https://github.com/scenario-labs/skills/issues/335)) ([d44410f](https://github.com/scenario-labs/skills/commit/d44410f058991f677ccf733a8e86ce95110857eb))

## [0.60.0](https://github.com/scenario-labs/skills/compare/skills-v0.59.0...skills-v0.60.0) (2026-10-26)


### Features

* **scenario-3d:** teach prompt-only 3D builds ([#316](https://github.com/scenario-labs/skills/issues/316)) ([b3cf5a4](https://github.com/scenario-labs/skills/commit/b3cf5a41efe603f93f5307b5bb7c7dad9fcd7925))
* **scenario-motion-loops:** add seamless brand-color loops in code ([#283](https://github.com/scenario-labs/skills/issues/283)) ([6e7b8c3](https://github.com/scenario-labs/skills/commit/6e7b8c30f3589c57cf515a00820ddef7c81cc11f))
* **scenario-video-editing:** teach green and blue screen keying ([#323](https://github.com/scenario-labs/skills/issues/323)) ([cf5b911](https://github.com/scenario-labs/skills/commit/cf5b911cee12a7542651cb374c0db3a0f27986fa))
* **scenario-video-to-motion:** add video motion capture skill ([#324](https://github.com/scenario-labs/skills/issues/324)) ([0c853cf](https://github.com/scenario-labs/skills/commit/0c853cf79194bc07b6c4a19202d10e048b527150))


### Bug Fixes

* **deps:** lock installs and patch fast-uri ([#328](https://github.com/scenario-labs/skills/issues/328)) ([0158ff7](https://github.com/scenario-labs/skills/commit/0158ff76f771f3d11fa2714da67331cda498d9e0))
* **scenario-3d:** apply game face budgets across image-to-3D ([#297](https://github.com/scenario-labs/skills/issues/297)) ([8cc9e9b](https://github.com/scenario-labs/skills/commit/8cc9e9b6a2848b6a16f7a6a727a937dab24b7cc6))
* **scenario-3d:** keep a stored GLB as is on download ([#296](https://github.com/scenario-labs/skills/issues/296)) ([e0a051c](https://github.com/scenario-labs/skills/commit/e0a051cd6e3a7ce3b27b607f4f859611de0c49df)), closes [#289](https://github.com/scenario-labs/skills/issues/289)
* **scenario-blender-blockout:** document headless build stages ([#295](https://github.com/scenario-labs/skills/issues/295)) ([e77c6fa](https://github.com/scenario-labs/skills/commit/e77c6fad59669ea2c6f2cc1a0f7c91d5a95bc9eb))
* **scenario-blender-blockout:** take a hero's color from the brief ([#294](https://github.com/scenario-labs/skills/issues/294)) ([3d88cf5](https://github.com/scenario-labs/skills/commit/3d88cf53276c6f281e0314a021c76d67b044e123))
* **scenario-blender-expert:** fail the gate on a mesh with no faces ([#291](https://github.com/scenario-labs/skills/issues/291)) ([9e052fa](https://github.com/scenario-labs/skills/commit/9e052fae613898464d52b93e3e947073c6934613))
* **scenario-blender-expert:** look inside node groups for image textures ([#293](https://github.com/scenario-labs/skills/issues/293)) ([1662b7b](https://github.com/scenario-labs/skills/commit/1662b7b9f7b1f8a6061f3e2bacd9cf13c55a6975)), closes [#287](https://github.com/scenario-labs/skills/issues/287)
* **scenario-blender-export:** close the gaps an application test found ([#302](https://github.com/scenario-labs/skills/issues/302)) ([06ba725](https://github.com/scenario-labs/skills/commit/06ba72576050043795aaad82184ba540a700e674))
* **scenario-blender-export:** keep LODs of a glTF import closed ([#331](https://github.com/scenario-labs/skills/issues/331)) ([7598531](https://github.com/scenario-labs/skills/commit/759853164460184e7076097f938d93b9e954987f))
* **scenario-kinetic-music-video:** document still plates and bloom ([#332](https://github.com/scenario-labs/skills/issues/332)) ([5ea59b5](https://github.com/scenario-labs/skills/commit/5ea59b5d664eb531e02ae15f4b38dbb21a68e979))
* **scenario-workflow-authoring:** require only an output pin to publish ([#322](https://github.com/scenario-labs/skills/issues/322)) ([57754ca](https://github.com/scenario-labs/skills/commit/57754ca2d58d11e7675f16b87bbdf41358687a98))
* **scenario:** bring the body back under the word cap ([#333](https://github.com/scenario-labs/skills/issues/333)) ([2fa1407](https://github.com/scenario-labs/skills/commit/2fa140761199a105bdd5c78d0c9a7eabde7ec2e6))
* **scenario:** clarify payload-specific Relax-mode waits ([#321](https://github.com/scenario-labs/skills/issues/321)) ([059185f](https://github.com/scenario-labs/skills/commit/059185f954282d9981a7204a8cc72e1636506b50))
* **scenario:** fit core guidance within the word budget ([cf5b911](https://github.com/scenario-labs/skills/commit/cf5b911cee12a7542651cb374c0db3a0f27986fa))
* **scenario:** fit shared guidance within its word budget ([0c853cf](https://github.com/scenario-labs/skills/commit/0c853cf79194bc07b6c4a19202d10e048b527150))
* **scenario:** route inline upload decode errors to the file_size path ([#320](https://github.com/scenario-labs/skills/issues/320)) ([78c951e](https://github.com/scenario-labs/skills/commit/78c951e280c1ad78a477907d713fa378702a52f9))
* **scenario:** stop generation on unmatched recommendations ([b3cf5a4](https://github.com/scenario-labs/skills/commit/b3cf5a41efe603f93f5307b5bb7c7dad9fcd7925))
* **skills:** repair dead links in the Roblox expert references ([#326](https://github.com/scenario-labs/skills/issues/326)) ([26aa322](https://github.com/scenario-labs/skills/commit/26aa3223461ca8688f7e8e1abfc981ae69968787))


### Documentation

* add SUPPORT.md and the release, Scorecard and license badges ([3102ff9](https://github.com/scenario-labs/skills/commit/3102ff980b454417132d3f69f1cc04b5b330afbc))

## [0.59.0](https://github.com/scenario-labs/skills/compare/skills-v0.58.0...skills-v0.59.0) (2026-10-20)


### Features

* **scenario-blender-blockout:** add cast styles for character stand-ins ([#276](https://github.com/scenario-labs/skills/issues/276)) ([4c20188](https://github.com/scenario-labs/skills/commit/4c20188bd712983070cd7dc2b5ea28e9afcb96be))
* **scenario-blender-expert:** gate assets before export or handoff ([#269](https://github.com/scenario-labs/skills/issues/269)) ([8615d6b](https://github.com/scenario-labs/skills/commit/8615d6bd281d84af3d59b51623da6a4a5ae66701))
* **scenario-blender-export:** export Blender assets for game engines ([#270](https://github.com/scenario-labs/skills/issues/270)) ([020ff0b](https://github.com/scenario-labs/skills/commit/020ff0b51fe44455806c80997450f942e8db4c2e))
* **scenario-blender-rigging:** add ARKit and viseme shape-key sets ([#271](https://github.com/scenario-labs/skills/issues/271)) ([054cf6e](https://github.com/scenario-labs/skills/commit/054cf6e4862a0274cf50f35bf6d92189d641e789))
* **scenario-team-admin:** create, update, and delete projects ([#268](https://github.com/scenario-labs/skills/issues/268)) ([cf206e6](https://github.com/scenario-labs/skills/commit/cf206e66f9273c72dc5960069d5cca8280f38599))
* **scenario-video-color-grade:** grade footage with code-written LUTs ([#277](https://github.com/scenario-labs/skills/issues/277)) ([f0adb5b](https://github.com/scenario-labs/skills/commit/f0adb5b5ebc1fc8f7e333554d2aeb767c5558d6b))
* **skills:** add Roblox Studio expert tools ([#274](https://github.com/scenario-labs/skills/issues/274)) ([7d0a5d1](https://github.com/scenario-labs/skills/commit/7d0a5d1d413c3666327820d716a57788dbb5e5de))


### Bug Fixes

* **scenario-3d:** map multi-view side images from the subject's own left ([#266](https://github.com/scenario-labs/skills/issues/266)) ([0dc56b4](https://github.com/scenario-labs/skills/commit/0dc56b47be182f9e991e902d7c4f0d715132f584))
* **scenario-3d:** price a 3D batch from one real concept ([#267](https://github.com/scenario-labs/skills/issues/267)) ([dd507b9](https://github.com/scenario-labs/skills/commit/dd507b95a5d0ba59b0e47624496e7f73240d4469))
* **scenario-3d:** show creature concepts side-on and trim the body ([#280](https://github.com/scenario-labs/skills/issues/280)) ([8112eef](https://github.com/scenario-labs/skills/commit/8112eefea2c34bd4afc5cdacd77daad60d0e4775))
* **scenario:** copy a private asset from another project with asset_copy ([#265](https://github.com/scenario-labs/skills/issues/265)) ([47d0795](https://github.com/scenario-labs/skills/commit/47d079566b1e87ae249a57f2b105af6100ef93d1))
* **scenario:** stop a batch at the Relax-mode "wait N seconds" 429 ([#264](https://github.com/scenario-labs/skills/issues/264)) ([2068423](https://github.com/scenario-labs/skills/commit/2068423c01f14d507ed7f81ebd9d945daf1db444))
* **scenario:** tighten the skill body and keep asset_copy to one team ([#279](https://github.com/scenario-labs/skills/issues/279)) ([c64908a](https://github.com/scenario-labs/skills/commit/c64908adb3e9bcc3989c3bd786c0436930d57e7c))


### Documentation

* **docs:** name the scenario-3d creature batch as a known test case ([#290](https://github.com/scenario-labs/skills/issues/290)) ([d4b07c0](https://github.com/scenario-labs/skills/commit/d4b07c032a8f30f965a2986f6b01187637f18710))

## [0.58.0](https://github.com/scenario-labs/skills/compare/skills-v0.57.0...skills-v0.58.0) (2026-10-17)


### Features

* **scenario-blender-blockout:** add blockouts for render-to-real video ([#243](https://github.com/scenario-labs/skills/issues/243)) ([7c1a414](https://github.com/scenario-labs/skills/commit/7c1a41405ff8985d7b707fccd6a85620cf6e0543))
* **scenario-blender-expert:** teach the Scenario Blender Plugin bridge ([#240](https://github.com/scenario-labs/skills/issues/240)) ([c94fc7d](https://github.com/scenario-labs/skills/commit/c94fc7d37a787dc189d453af2b3d21620fb2ebb0))
* **scenario-reel-recast:** recast a trend reel with your character ([#245](https://github.com/scenario-labs/skills/issues/245)) ([08d5969](https://github.com/scenario-labs/skills/commit/08d59697af012a2f41600aba80d8dcf49a535c68))


### Bug Fixes

* **scenario-patina-retexture:** restore the frame rate xfade needs on ffmpeg 7 ([#262](https://github.com/scenario-labs/skills/issues/262)) ([1aaa21e](https://github.com/scenario-labs/skills/commit/1aaa21e00ad4e2031b99fecbdb96569730251c65))
* **scenario-seedance:** point to draft mode and the drafts skill ([#253](https://github.com/scenario-labs/skills/issues/253)) ([aa4fa1b](https://github.com/scenario-labs/skills/commit/aa4fa1bb22ed46c9fbce8704659f64a7a52d4c8a))
* **skills:** drop references to an unpublished Blender blockout skill ([#241](https://github.com/scenario-labs/skills/issues/241)) ([236fc59](https://github.com/scenario-labs/skills/commit/236fc59d4cfeaca6abd2e79161ae9a4b44d74fe0))

## [0.57.0](https://github.com/scenario-labs/skills/compare/skills-v0.56.0...skills-v0.57.0) (2026-10-17)


### Features

* **scenario-blender-2d-animation:** animate platformer shots in Blender ([#238](https://github.com/scenario-labs/skills/issues/238)) ([dc592af](https://github.com/scenario-labs/skills/commit/dc592af7139ffacfe8fdae7dc7efa80f4dd09be3))
* **scenario-blender:** add the Blender extension skill ([#236](https://github.com/scenario-labs/skills/issues/236)) ([ac81a88](https://github.com/scenario-labs/skills/commit/ac81a88a3e3e325cd34a54937b13e63d03a92314))
* **scenario-seedance-drafts:** draft cheap takes, review them, complete only the picks ([#244](https://github.com/scenario-labs/skills/issues/244)) ([cd3834f](https://github.com/scenario-labs/skills/commit/cd3834f01932831e0cce414640960603adbd6d37))


### Bug Fixes

* **scenario-blender-2d-animation:** tile wide layers without a hard seam ([#248](https://github.com/scenario-labs/skills/issues/248)) ([a840a81](https://github.com/scenario-labs/skills/commit/a840a81e62594cbdebbb6cf4d406211764d93d1b))
* **scenario-blender:** keep wait_for_job inside the 60-second client limit ([#250](https://github.com/scenario-labs/skills/issues/250)) ([d76be40](https://github.com/scenario-labs/skills/commit/d76be40ffa531da5d29087de902e8afa195878de)), closes [#249](https://github.com/scenario-labs/skills/issues/249)
* **scenario:** give Team and Enterprise their own custom connector route ([#233](https://github.com/scenario-labs/skills/issues/233)) ([907764d](https://github.com/scenario-labs/skills/commit/907764d4490920a913b60947f9b673359b7a002e))
* **skills:** save audio downloads under the format Scenario returns ([#234](https://github.com/scenario-labs/skills/issues/234)) ([49ed910](https://github.com/scenario-labs/skills/commit/49ed910541b9ea56da4e8ef5e2df93fa905f7cb7))


### Documentation

* gather role and goal installs in INSTALL.md with one --skill each ([#239](https://github.com/scenario-labs/skills/issues/239)) ([39f39d3](https://github.com/scenario-labs/skills/commit/39f39d37865782ccb2b8d6b8820ee2a26d1bde75))

## [0.56.0](https://github.com/scenario-labs/skills/compare/skills-v0.55.0...skills-v0.56.0) (2026-10-14)


### Features

* **scenario-3d:** teach the mesh edit on the LLM-based 3D members ([#222](https://github.com/scenario-labs/skills/issues/222)) ([36b0445](https://github.com/scenario-labs/skills/commit/36b04459dc4dc53f9757beaef63ab770a8228af1))
* **skills:** move UGC and fan-cam video into Socials ([#208](https://github.com/scenario-labs/skills/issues/208)) ([9dd33ec](https://github.com/scenario-labs/skills/commit/9dd33ec6b29afd837fc9fcbebc33b18c84d5b210))


### Bug Fixes

* **ci:** keep the commit hook's git variables away from uv's git commands ([#232](https://github.com/scenario-labs/skills/issues/232)) ([a7e3f2b](https://github.com/scenario-labs/skills/commit/a7e3f2bfb0aa26556ac13fd770d6eb940aff1a2f))
* **scenario-chatgpt-pet-create:** refuse pet ids that leave the package or pets folder ([#209](https://github.com/scenario-labs/skills/issues/209)) ([343d66a](https://github.com/scenario-labs/skills/commit/343d66aec9b98ebefad9f2722751546861e6b60a))
* **scenario-game-assets:** settle transparency before generating the potion set ([#219](https://github.com/scenario-labs/skills/issues/219)) ([a600293](https://github.com/scenario-labs/skills/commit/a600293862f20055b7df79a3484e6b4bd5c61105))
* **scenario-godot-expert:** run the Godot toolkit on Windows ([#223](https://github.com/scenario-labs/skills/issues/223)) ([4e21e92](https://github.com/scenario-labs/skills/commit/4e21e92862e43870662e6b37083f3323daa697ee))
* **scenario-godot-performance-export:** run the Android helpers on Windows and Linux ([#228](https://github.com/scenario-labs/skills/issues/228)) ([9172ac2](https://github.com/scenario-labs/skills/commit/9172ac29a7bb543a1b51a8fa7970ea404932ba37))
* **scenario:** keep a catalog tool's dry_run inside parameters ([#218](https://github.com/scenario-labs/skills/issues/218)) ([bb1f758](https://github.com/scenario-labs/skills/commit/bb1f758fcc9a508ee456d87d382df6cbad3ba132))
* **scenario:** name the Enterprise custom role that can also add custom connectors ([#229](https://github.com/scenario-labs/skills/issues/229)) ([f58d0cb](https://github.com/scenario-labs/skills/commit/f58d0cb46d16b249f945e5758796734299bed0ba))
* **scenario:** name the organization-owner gate on Team and Enterprise custom connectors ([#217](https://github.com/scenario-labs/skills/issues/217)) ([a8b4077](https://github.com/scenario-labs/skills/commit/a8b40770c180c181a2bbb755b96fc8f802dfa07c))
* **scenario:** point custom connector setup at Customize, Connectors, Add ([#231](https://github.com/scenario-labs/skills/issues/231)) ([7d32a6d](https://github.com/scenario-labs/skills/commit/7d32a6ded6a3930c278376a32c821e84ffc74db1))
* **scenario:** say asset_download converts meshes too ([#227](https://github.com/scenario-labs/skills/issues/227)) ([15e621d](https://github.com/scenario-labs/skills/commit/15e621df3f63046f2d5fd2d48863a954121ae857))
* **scenario:** say which catalog inputs nearly every tool declares ([#225](https://github.com/scenario-labs/skills/issues/225)) ([0d85b4c](https://github.com/scenario-labs/skills/commit/0d85b4c681fc1aaf6e6feb6e801b88de84e79994))
* **scenario:** set up Claude apps through one connector, add Codex ([#213](https://github.com/scenario-labs/skills/issues/213)) ([12aacdd](https://github.com/scenario-labs/skills/commit/12aacdd49c69f84bef3dd9be0cd1aff6c661a52a))
* **skills:** discover analysis executor permissions at runtime ([#214](https://github.com/scenario-labs/skills/issues/214)) ([d64e363](https://github.com/scenario-labs/skills/commit/d64e363dd994bcb2f6110e048f22d61c8ab6cb5c))
* **skills:** file a collection in one call, since filed ids are skipped ([#221](https://github.com/scenario-labs/skills/issues/221)) ([0b5fa62](https://github.com/scenario-labs/skills/commit/0b5fa62b833b327e091f7f3d6df372c201f927b3))


### Documentation

* **skills:** say the CLI cannot install a picker group by name ([#220](https://github.com/scenario-labs/skills/issues/220)) ([8246faa](https://github.com/scenario-labs/skills/commit/8246faab0247a2f3314bce92c9b92cef4148454e)), closes [#192](https://github.com/scenario-labs/skills/issues/192)

## [0.55.0](https://github.com/scenario-labs/skills/compare/skills-v0.54.0...skills-v0.55.0) (2026-10-11)


### Features

* **scenario-3d:** build rig-ready characters with quad topology ([#205](https://github.com/scenario-labs/skills/issues/205)) ([12194b9](https://github.com/scenario-labs/skills/commit/12194b976dbf34d7e2c7a001fb33f5aa888c88ea))


### Bug Fixes

* **scenario:** never price a later step with a placeholder asset id ([#206](https://github.com/scenario-labs/skills/issues/206)) ([b624313](https://github.com/scenario-labs/skills/commit/b6243139a8993b0482aa5515f6a2ee6e88fb8345))
* **scenario:** read a creative-units 429 before reporting it ([#204](https://github.com/scenario-labs/skills/issues/204)) ([8d14905](https://github.com/scenario-labs/skills/commit/8d14905c10b365e5d3c88ce7f5b7c7c363abf9ef))
* **skills:** check plan access for every 3D chain step before paying the first ([#203](https://github.com/scenario-labs/skills/issues/203)) ([ebd393e](https://github.com/scenario-labs/skills/commit/ebd393e6f34546fc30a5ba5d0490a1fb228e70a1))
* **skills:** launch the remaining batch steps in waves ([#202](https://github.com/scenario-labs/skills/issues/202)) ([4e23bc2](https://github.com/scenario-labs/skills/commit/4e23bc2d4451f89b9827eae78f6865e0c5076a16))

## [0.54.0](https://github.com/scenario-labs/skills/compare/skills-v0.53.0...skills-v0.54.0) (2026-10-10)


### Features

* **scenario-kinetic-music-video:** render on a portrait 9:16 canvas ([#190](https://github.com/scenario-labs/skills/issues/190)) ([9e24359](https://github.com/scenario-labs/skills/commit/9e243596c460e10304a3d7588049fd761db0e117))
* **scenario-kinetic-music-video:** support scoped soundtrack edits ([#193](https://github.com/scenario-labs/skills/issues/193)) ([1c5f8f9](https://github.com/scenario-labs/skills/commit/1c5f8f9dfa46ab74b514a3c44f65935171b416e9))
* **scenario-multi-reference:** add multi-reference composition skill ([#191](https://github.com/scenario-labs/skills/issues/191)) ([07731a3](https://github.com/scenario-labs/skills/commit/07731a3ce8e21b469ab807a7ac787f945e2d9114))
* **skills:** add a Socials grouping for the kinetic music video ([9e24359](https://github.com/scenario-labs/skills/commit/9e243596c460e10304a3d7588049fd761db0e117))
* **skills:** add ChatGPT pet create and update skills ([#201](https://github.com/scenario-labs/skills/issues/201)) ([89d0164](https://github.com/scenario-labs/skills/commit/89d01644b34af1b658de5c0bc685bf38afedb9cb))
* **skills:** add video thumbnail and ad variant skills ([#194](https://github.com/scenario-labs/skills/issues/194)) ([30d1c88](https://github.com/scenario-labs/skills/commit/30d1c88b0873547e28ec8bf6d6ed046b2c38ee42))


### Bug Fixes

* **scenario-gpt-image:** route transparent cutouts to the 2.5 members ([#195](https://github.com/scenario-labs/skills/issues/195)) ([423eacd](https://github.com/scenario-labs/skills/commit/423eacdc3daa827022d1a3e75bfefa712fa06aa0))
* **scenario-kinetic-music-video:** correct plate crops and chant timing ([#200](https://github.com/scenario-labs/skills/issues/200)) ([1e924df](https://github.com/scenario-labs/skills/commit/1e924dfe430847673466476d882723b5984c788d))
* **scenario-video-assembly:** stop sending SRT files to upload_asset ([30d1c88](https://github.com/scenario-labs/skills/commit/30d1c88b0873547e28ec8bf6d6ed046b2c38ee42))

## [0.53.0](https://github.com/scenario-labs/skills/compare/skills-v0.52.0...skills-v0.53.0) (2026-10-04)


### Features

* **scenario-minimax-video:** teach the H3 Max extend, insert, and recast members ([#180](https://github.com/scenario-labs/skills/issues/180)) ([5de214c](https://github.com/scenario-labs/skills/commit/5de214cc95ade09c038c7e195fda2ce641244ad0))
* **scenario-seedream:** add 5.0 Flash and Flash Layerize ([#182](https://github.com/scenario-labs/skills/issues/182)) ([9979274](https://github.com/scenario-labs/skills/commit/9979274d3e2b457508ae99662419a6d1e0ded3a5))
* **scenario-walkable-room:** add walkable room skill from one photo ([#185](https://github.com/scenario-labs/skills/issues/185)) ([43e1132](https://github.com/scenario-labs/skills/commit/43e1132d24ed931f11ea44165bef72e83a751d81))


### Bug Fixes

* **scenario-seedance:** tell a moderation block from a fixable prompt ([#181](https://github.com/scenario-labs/skills/issues/181)) ([f7cc98b](https://github.com/scenario-labs/skills/commit/f7cc98b7ca8d63b6a9086ca08e2fd355a49bbd5d))
* **skills:** describe Seedance shot sound positively, never as an exclusion ([#187](https://github.com/scenario-labs/skills/issues/187)) ([87b8501](https://github.com/scenario-labs/skills/commit/87b8501aef067d2dd4e26b21485e2ce03ec2845b))
* **skills:** file only missing ids, since one duplicate fails the whole collection add ([#183](https://github.com/scenario-labs/skills/issues/183)) ([f28b840](https://github.com/scenario-labs/skills/commit/f28b840ac355bbc8371d7f2362ea5c608ac3ff4f))
* **skills:** launch batches in waves under the concurrency ceiling ([#184](https://github.com/scenario-labs/skills/issues/184)) ([ecaa277](https://github.com/scenario-labs/skills/commit/ecaa2773cbc6cf4ba1cf0adb275d2cb5f7a72a90))
* **skills:** name video sound positively in scenario-video and scenario-wan ([#188](https://github.com/scenario-labs/skills/issues/188)) ([91caa01](https://github.com/scenario-labs/skills/commit/91caa011e13774a220aba7136309b49964104040))

## [0.52.0](https://github.com/scenario-labs/skills/compare/skills-v0.51.0...skills-v0.52.0) (2026-10-04)


### Features

* **scenario-kinetic-music-video:** add kinetic typography music video skill ([#175](https://github.com/scenario-labs/skills/issues/175)) ([f8aaebb](https://github.com/scenario-labs/skills/commit/f8aaebbae0c80be35795505b6eeb67146005cbbe))


### Bug Fixes

* **skills:** lint shipped Python with ruff's pyflakes rules ([#178](https://github.com/scenario-labs/skills/issues/178)) ([ca0fec5](https://github.com/scenario-labs/skills/commit/ca0fec5e39e0db19b2637d7378f3757bc78343ad))

## [0.51.0](https://github.com/scenario-labs/skills/compare/skills-v0.50.0...skills-v0.51.0) (2026-10-04)


### Features

* **skills:** add Godot expert tools ([#174](https://github.com/scenario-labs/skills/issues/174)) ([339b02b](https://github.com/scenario-labs/skills/commit/339b02b08bbc91a7c3296db5f1194402f8d514c1))

## [0.50.0](https://github.com/scenario-labs/skills/compare/skills-v0.49.0...skills-v0.50.0) (2026-10-03)


### Features

* **scenario-3d:** teach the staged mesh, unwrap, retexture, rig chain ([#166](https://github.com/scenario-labs/skills/issues/166)) ([135ca06](https://github.com/scenario-labs/skills/commit/135ca069b0b5c94f9d6e7fb3a7d7d6694a35a918))
* **scenario-game-assets:** teach the terrain tileset and transition lane ([#164](https://github.com/scenario-labs/skills/issues/164)) ([afcbfcd](https://github.com/scenario-labs/skills/commit/afcbfcd54fcf41b7bc43098293b97b5e30c3b87d))
* **scenario-ideogram:** add Ideogram 4.5 and Precise Edit with tiers, sizes, and edit tradeoffs ([#171](https://github.com/scenario-labs/skills/issues/171)) ([4069027](https://github.com/scenario-labs/skills/commit/40690270711932df21969cea9f06e903daa58e9a))
* **scenario-side-view-game-kit:** add the side-view sprite and level layer skill ([#173](https://github.com/scenario-labs/skills/issues/173)) ([800d5b5](https://github.com/scenario-labs/skills/commit/800d5b5e0d80ff046eb4f3373c19db6b893f96e5))
* **scenario:** put saved preferences in the core loop ([#168](https://github.com/scenario-labs/skills/issues/168)) ([a8a5463](https://github.com/scenario-labs/skills/commit/a8a54634252e943d19f1af4403f23ca582aaf0fd))


### Bug Fixes

* **scenario-gpt-image:** say what off-grid sizes and over-wide edit sources actually return ([#172](https://github.com/scenario-labs/skills/issues/172)) ([db55a34](https://github.com/scenario-labs/skills/commit/db55a34a9faae96367ccb856500e9d1e75d00ec3))
* **scenario-seedance:** price Auto duration and bind reference audio to a role ([#165](https://github.com/scenario-labs/skills/issues/165)) ([6c59c0d](https://github.com/scenario-labs/skills/commit/6c59c0ddc809592c72ee8ca32d1dfb2418df79b8))
* **skills:** loop a batch of assets instead of feeding it to one model call ([#167](https://github.com/scenario-labs/skills/issues/167)) ([c80bae9](https://github.com/scenario-labs/skills/commit/c80bae918f5a2d844fdab03df99854adc23f9457))

## [0.49.0](https://github.com/scenario-labs/skills/compare/skills-v0.48.0...skills-v0.49.0) (2026-10-01)


### Features

* **scenario-sprite-animation:** teach the directional character cycles lane ([#169](https://github.com/scenario-labs/skills/issues/169)) ([c8a4bdd](https://github.com/scenario-labs/skills/commit/c8a4bddf2b052864f2eaf98d7ce5aa044c72bf42))


### Bug Fixes

* **scenario-3d:** cover Claude Opus 5.5 3D and the effort-only 3D Artist pricing ([#163](https://github.com/scenario-labs/skills/issues/163)) ([d87071d](https://github.com/scenario-labs/skills/commit/d87071d22edb5eb5871c9034f89cada518657891))
* **scenario:** say that HEIC photos upload as is, without conversion ([#157](https://github.com/scenario-labs/skills/issues/157)) ([5936eaa](https://github.com/scenario-labs/skills/commit/5936eaaa72ce998920f864be1454e73e07541936))


### Documentation

* **skills:** drop the not-yet-run status notes from the Maya and ZBrush tools ([#161](https://github.com/scenario-labs/skills/issues/161)) ([5786acc](https://github.com/scenario-labs/skills/commit/5786accd3bb6d79808330230c698898862e8a1d4))

## [0.48.0](https://github.com/scenario-labs/skills/compare/skills-v0.47.0...skills-v0.48.0) (2026-09-26)


### Features

* **skills:** add expert tools for DCC software and game engines ([#159](https://github.com/scenario-labs/skills/issues/159)) ([9ac7861](https://github.com/scenario-labs/skills/commit/9ac7861f751aa712cbc98813ac4ead81ff4e073a))

## [0.47.0](https://github.com/scenario-labs/skills/compare/skills-v0.46.0...skills-v0.47.0) (2026-09-25)


### Features

* **scenario-3d:** teach the texture and lighting controls on image-to-3D members ([#155](https://github.com/scenario-labs/skills/issues/155)) ([e12b710](https://github.com/scenario-labs/skills/commit/e12b71004aa7fdd4a41619335a0875f8a1ae42d1))
* **scenario-audio:** teach two-speaker dialogue, per-member tag syntax, and text caps for speech ([#154](https://github.com/scenario-labs/skills/issues/154)) ([8b6abb9](https://github.com/scenario-labs/skills/commit/8b6abb98628d5c8c9ed717d6ca6f759181b0ef31))
* **scenario-orbit-views:** add new camera angles through a 3D intermediary ([#151](https://github.com/scenario-labs/skills/issues/151)) ([21bccc3](https://github.com/scenario-labs/skills/commit/21bccc3b67b3311a080c3f2394c1932b71e592f3))
* **scenario-video:** teach the whole-song music video lane ([#156](https://github.com/scenario-labs/skills/issues/156)) ([47f3101](https://github.com/scenario-labs/skills/commit/47f3101fa7e9a00997ea9b1914000d6489b23dd5))


### Bug Fixes

* **scenario-workflow-authoring:** teach ifElse gating and conditional prompt text ([#153](https://github.com/scenario-labs/skills/issues/153)) ([7c0355f](https://github.com/scenario-labs/skills/commit/7c0355fee219535e13d5cff6bc6012c53d7697fb))
* **skills:** discover workflow templates through search ([#152](https://github.com/scenario-labs/skills/issues/152)) ([1bf9582](https://github.com/scenario-labs/skills/commit/1bf95822d5a0894dcaebe7c8259b893f5d370341))

## [0.46.0](https://github.com/scenario-labs/skills/compare/skills-v0.45.0...skills-v0.46.0) (2026-09-22)


### Features

* **scenario-game-assets:** teach the parallax background lane ([#146](https://github.com/scenario-labs/skills/issues/146)) ([286b77d](https://github.com/scenario-labs/skills/commit/286b77d0e3a18978aa0dbc7f04d3acb461369107))
* **scenario-model-comparison:** add the model comparison skill ([#147](https://github.com/scenario-labs/skills/issues/147)) ([997c715](https://github.com/scenario-labs/skills/commit/997c71597e92056cf90f9f3e17d8439a54c31023))
* **scenario-model-training:** teach sample prompts, identity drift, and the LoRA base pairing ([#144](https://github.com/scenario-labs/skills/issues/144)) ([870fe4c](https://github.com/scenario-labs/skills/commit/870fe4ccf13cb52a91d6a5908635154f6ba30220))
* **skills:** teach lyric correction candidates and seeded music takes ([#145](https://github.com/scenario-labs/skills/issues/145)) ([b4c64a2](https://github.com/scenario-labs/skills/commit/b4c64a2b26e0d4f0d3d3de113522bcb5547a8af8))


### Bug Fixes

* **agents:** exclude maintainer skills from default discovery ([#150](https://github.com/scenario-labs/skills/issues/150)) ([4b81cfb](https://github.com/scenario-labs/skills/commit/4b81cfb32a045c087f9ab3cf64fa280fb422ef28))
* **scenario:** make the upload contract explicit, from file_size to what a corrupt-file failure means ([#148](https://github.com/scenario-labs/skills/issues/148)) ([1d1a899](https://github.com/scenario-labs/skills/commit/1d1a899805bd396bdea8bd9ba2ed0eef17b3271e))

## [0.45.0](https://github.com/scenario-labs/skills/compare/skills-v0.44.0...skills-v0.45.0) (2026-09-21)


### Features

* **scenario-3d:** cover Astra 3D's fit and cost levers, the parts lane, and game-readiness ([#141](https://github.com/scenario-labs/skills/issues/141)) ([75d8a7a](https://github.com/scenario-labs/skills/commit/75d8a7aa5356916c8ce060857bb4a3a7cd5cd48b))
* **scenario-audio:** teach the song-extend lane, the stems gap, and per-member seed and batch ([#142](https://github.com/scenario-labs/skills/issues/142)) ([60b6b6d](https://github.com/scenario-labs/skills/commit/60b6b6dec00243988cd326f1f1cce6775ec0a409))
* **scenario-image:** teach landing an exact pixel size, and the blur and literalness fixes ([#140](https://github.com/scenario-labs/skills/issues/140)) ([985465b](https://github.com/scenario-labs/skills/commit/985465bfd6d251840760d078f645e107270504e6))
* **scenario-patina-retexture:** add the PATINA retexture and comparison skill ([#137](https://github.com/scenario-labs/skills/issues/137)) ([7f3e506](https://github.com/scenario-labs/skills/commit/7f3e5064ff6c397774b2eec2bb2eae1ac2f38173))
* **scenario-video:** teach duration floors, frame-anchor rules, reference audio, LoRAs, and retirements ([#143](https://github.com/scenario-labs/skills/issues/143)) ([1d1caf4](https://github.com/scenario-labs/skills/commit/1d1caf4219cb590648eab623b21b2afaaf5df42b))


### Bug Fixes

* **scenario:** clarify quota recovery and asset delivery ([#139](https://github.com/scenario-labs/skills/issues/139)) ([8753a54](https://github.com/scenario-labs/skills/commit/8753a5459afa808a815583a633ac97d4cdf8ea14))

## [0.44.0](https://github.com/scenario-labs/skills/compare/skills-v0.43.0...skills-v0.44.0) (2026-09-18)


### Features

* **scenario-video:** teach the lipsync lane: footage or still, face preflight, gating, and verifying the mouth moved ([#121](https://github.com/scenario-labs/skills/issues/121)) ([c7a25f5](https://github.com/scenario-labs/skills/commit/c7a25f5697d71c737690068bfd3dbc1c773db7e3))
* **skills:** add reusable isometric and sprite templates ([#124](https://github.com/scenario-labs/skills/issues/124)) ([6a7cf57](https://github.com/scenario-labs/skills/commit/6a7cf57fbc6c89ec2d98fc5e00a8fd420e9a7df6))

## [0.43.0](https://github.com/scenario-labs/skills/compare/skills-v0.42.0...skills-v0.43.0) (2026-09-17)


### Features

* **scenario-admin-analytics:** add cached MCP usage reporting ([#134](https://github.com/scenario-labs/skills/issues/134)) ([b5ebf6f](https://github.com/scenario-labs/skills/commit/b5ebf6f98495ec92c05d3ea6ccc3c1e416d2ae42))
* **scenario-workflow-authoring:** teach migrating a graph built in Weavy, ComfyUI, or another node tool ([#120](https://github.com/scenario-labs/skills/issues/120)) ([e79a388](https://github.com/scenario-labs/skills/commit/e79a3887e1ce50d67fbdd7d9227054074e61dfc9)), closes [#109](https://github.com/scenario-labs/skills/issues/109)

## [0.42.0](https://github.com/scenario-labs/skills/compare/skills-v0.41.1...skills-v0.42.0) (2026-09-16)


### Features

* **scenario-consistency:** add reference-to-video, style-reference, and when-to-train lanes ([#114](https://github.com/scenario-labs/skills/issues/114)) ([9dea74a](https://github.com/scenario-labs/skills/commit/9dea74a4e05110b8da154a33e6654414874902e9))
* **scenario-moderation:** cover video, audio, and IP Detection blocks ([#115](https://github.com/scenario-labs/skills/issues/115)) ([6f8074b](https://github.com/scenario-labs/skills/commit/6f8074bc2a873dab3219dd04e2d05e0a1751e50b))
* **scenario-team-admin:** add the team administration skill ([#118](https://github.com/scenario-labs/skills/issues/118)) ([8d41021](https://github.com/scenario-labs/skills/commit/8d41021b1333fe819b8ba1be14ad955d03d9ffa6))
* **skills:** teach shot direction, in-image copy, and frame chaining across image and video skills ([#119](https://github.com/scenario-labs/skills/issues/119)) ([5d223d9](https://github.com/scenario-labs/skills/commit/5d223d92a0a642ba061373dbe78dfde71544de4a))


### Bug Fixes

* **scenario:** name the catalog tools' argument facts the clean-room runs kept guessing ([#129](https://github.com/scenario-labs/skills/issues/129)) ([4749955](https://github.com/scenario-labs/skills/commit/47499557acbaac68c4a7cb50369255c4f6b77d94))

## [0.41.1](https://github.com/scenario-labs/skills/compare/skills-v0.41.0...skills-v0.41.1) (2026-09-15)


### Bug Fixes

* **scenario-sprite-animation:** verify extractor frame order instead of assuming time order ([#117](https://github.com/scenario-labs/skills/issues/117)) ([9b56fc1](https://github.com/scenario-labs/skills/commit/9b56fc14b726c39d8c906f14b91b9c85e9009b3c))
* **scenario:** name the search target, the api_key_create lane, and the full allowlist request ([#128](https://github.com/scenario-labs/skills/issues/128)) ([c82a963](https://github.com/scenario-labs/skills/commit/c82a963f253c131d73a76bcbdda435d7f1ed04c7))
* **scenario:** teach per-client re-authentication and the first-call failures usage data surfaced ([#116](https://github.com/scenario-labs/skills/issues/116)) ([0af22c0](https://github.com/scenario-labs/skills/commit/0af22c0e6a59414632a73da88dbe5e90a8477b79))
* **skills:** teach the payload errors usage data surfaces: file field names, image-only inputs, list caps, downloads ([#122](https://github.com/scenario-labs/skills/issues/122)) ([ff10d64](https://github.com/scenario-labs/skills/commit/ff10d6432c216b2ab04df66bd2e3d24329700cd0))
* **skills:** verify audio sync after a concat and frame order after an extraction instead of trusting either ([#123](https://github.com/scenario-labs/skills/issues/123)) ([d2a84cf](https://github.com/scenario-labs/skills/commit/d2a84cf5fd78aa06f52dbbd6969aecb0f37b71f9))

## [0.41.0](https://github.com/scenario-labs/skills/compare/skills-v0.40.1...skills-v0.41.0) (2026-09-10)


### Features

* **scenario-gpt-image:** add GPT Image 2.5 Flare and Sunburst with the quality price ladder ([#111](https://github.com/scenario-labs/skills/issues/111)) ([0ad9328](https://github.com/scenario-labs/skills/commit/0ad9328d8065c31e004189fc3d409fed148459bb))
* **scenario-sprite-animation:** add the single-sheet lane with post-alignment, slice and snap-per-tile packaging ([#110](https://github.com/scenario-labs/skills/issues/110)) ([648c9d9](https://github.com/scenario-labs/skills/commit/648c9d95e5bf30ee7f18459c2f27c8bb3eead3a8))


### Bug Fixes

* **skills:** route every wait=false launch to jobs_wait regardless of the status word ([#112](https://github.com/scenario-labs/skills/issues/112)) ([ca1908c](https://github.com/scenario-labs/skills/commit/ca1908c31b965b1b9611be40f812ffe5c598166b))


### Documentation

* **tooling:** link the upstream skills.sh groupings report ([#106](https://github.com/scenario-labs/skills/issues/106)) ([168e668](https://github.com/scenario-labs/skills/commit/168e6682d6cd9f2fd4b6196c1c904aa449048e1a))

## [0.40.1](https://github.com/scenario-labs/skills/compare/skills-v0.40.0...skills-v0.40.1) (2026-09-02)


### Bug Fixes

* **scenario-model-training:** launch training only through start after an approved dry-run quote ([#103](https://github.com/scenario-labs/skills/issues/103)) ([75e68f9](https://github.com/scenario-labs/skills/commit/75e68f9a5078ba9a137e33e949d5daa31d8a2d79))

## [0.40.0](https://github.com/scenario-labs/skills/compare/skills-v0.39.0...skills-v0.40.0) (2026-09-02)


### Features

* **scenario-caption-studio:** teach video captioning with Caption Studio ([#97](https://github.com/scenario-labs/skills/issues/97)) ([4fde0cc](https://github.com/scenario-labs/skills/commit/4fde0cc643e8919ee84e6d874904f9ce802b78ed))


### Bug Fixes

* **skills:** route capability discovery through recommend, name the fixed platform tools, and close validated gaps ([#100](https://github.com/scenario-labs/skills/issues/100)) ([afb4408](https://github.com/scenario-labs/skills/commit/afb44086affb74b635f2724d63791a80e330555f))

## [0.39.0](https://github.com/scenario-labs/skills/compare/skills-v0.38.0...skills-v0.39.0) (2026-09-01)


### Features

* **agents:** audit discovery misuse in pr-handle and align maintainer surfaces on recommend-first discovery ([#99](https://github.com/scenario-labs/skills/issues/99)) ([e0a61d5](https://github.com/scenario-labs/skills/commit/e0a61d5ca820c1bee41b52106756bb46a202afad))
* **scenario-brand-kit:** add brand kit skill for editable-SVG visual identities ([#92](https://github.com/scenario-labs/skills/issues/92)) ([32b9e2b](https://github.com/scenario-labs/skills/commit/32b9e2b197a58dcf24e80bfd8333deb565e9fe45))

## [0.38.0](https://github.com/scenario-labs/skills/compare/skills-v0.37.3...skills-v0.38.0) (2026-08-31)


### Features

* **skills:** add scenario-ugc and scenario-fan-cam, with the discovery and filing rules they proved out ([#91](https://github.com/scenario-labs/skills/issues/91)) ([c703659](https://github.com/scenario-labs/skills/commit/c70365922199a91b81831e1638c376ed9a7dea11))

## 0.37.3 (2026-08-28)


### Features

* **ci:** adopt release-please and publish release notes to the Scenario changelog ([#89](https://github.com/scenario-labs/skills/issues/89)) ([ec9542a](https://github.com/scenario-labs/skills/commit/ec9542a5743845207c6592b98b6e0f3b05bbf85a))


### Bug Fixes

* **scenario-sprite-animation:** route alpha through the removal pass the video lane forces ([#87](https://github.com/scenario-labs/skills/issues/87)) ([2442874](https://github.com/scenario-labs/skills/commit/2442874f7d9d4544fbfedcd74803cc3c2c81c2f9))
* **skills:** name the direct tools and the resize surface agents kept missing ([#95](https://github.com/scenario-labs/skills/issues/95)) ([57a6afe](https://github.com/scenario-labs/skills/commit/57a6afe6b6ff7245a9fb46fa18a2330a480f642c))
* **skills:** teach the resize fit parameter and retire preserveAspectRatio ([#85](https://github.com/scenario-labs/skills/issues/85)) ([4db8c5f](https://github.com/scenario-labs/skills/commit/4db8c5f3a11969177b1197946c9a222f7d1268b6))
