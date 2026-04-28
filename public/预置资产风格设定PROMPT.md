# 预置资产风格设定 Prompt

本文件对齐当前前端风格选择器，来源为 `src/lib/prompt/layers/style-registry.ts`。

当前风格选择器只选择 `style_key`，后端会把对应的 `part2_content` 注入最终生图 prompt 的风格层。定妆照的构图、站姿、镜头和背景不写在风格层里，由 PORTRAIT 模板统一控制。

新增的“定妆照场景背景图”不是新的 `style_key`，而是 PORTRAIT 的 `background_mode=scene` 画面模式；它可以与下列任意风格一起使用。

## 当前风格选择器

### xuanhuan_live_action

- label: 玄幻真人风
- category: cdrama
- brief: 玄幻真人风：东方玄幻与仙侠真人影视造型质感，强调宗门秩序、修炼层级与真实服饰材质；避免法相巨影、塑料特效和现代元素。

```text
【美术基调】东方玄幻真人影视质感，写实仙侠修炼美学，真人比例与照片级材质。

【人物造型方向】
造型需体现身份、修为、宗门、阵营与性格差异。
- 高阶修士：仪式感强，披风、发冠、玉佩、灵纹刺绣齐全。
- 低阶弟子：朴素实用，布衣、皮带、简配饰。
- 反派：不廉价魔化，通过材质、配色与纹样体现压迫感。

【服装与材质】
纱、绸、麻、皮革、金属甲片、玉饰、骨饰、灵纹刺绣；
宗门可建立统一纹样（剑纹、云纹、鹤纹、火纹、莲纹、星纹）。
服饰材质必须真实可辨，避免塑料感、手办感、玩具感、廉价布料贴图。

【色彩系统】
- 正道宗门：青白、月银、淡金、墨蓝。
- 王朝势力：朱红、玄黑、金色、玉白。
- 妖魔禁域：血红、暗紫、黑灰、幽绿。
- 上古遗迹：石灰、古铜、暗金、风化白。

【皮肤与质感】保留真实皮肤纹理与岁月痕迹，不过度磨皮，不瓷娃娃感。

【避免】法相巨影、背后神像投影、半透明虚影、西方板甲、现代拉链、二次元平涂、动漫感。
```

part4_reference:

```text
live-action xuanhuan costume design, eastern fantasy cultivation wardrobe, Chinese xianxia realistic fabric and armor, ritual embroidery, real skin texture
```

### digital_monster_adventure

- label: 数码宝贝风
- category: anime
- brief: 数码宝贝风：少年冒险动画造型，强调伙伴亲和力、高饱和色与清晰剪影；避免成人化和写实暗黑化。

```text
【美术基调】90 年代冒险动漫美学升级版，干净清晰的动漫线条与厚涂上色，青春冒险感。

【人物造型方向】
主角团使用清晰颜色区分与性格符号：飞行员护目镜、连帽衫、工装短裤、背包、手环、数码终端。
服装适合奔跑冒险，不过度成人化、不过度时装化。
伙伴生物（如出现）：轮廓可爱、表情丰富、数码纹路清晰、进化前后颜色与徽记保持继承。

【服装与材质】
棉布、尼龙、工装帆布、塑料护目镜、橡胶手环、发光数码设备；
服装版型宽松、轮廓简洁，便于识别剪影。

【色彩系统】
明快高饱和但不刺眼。
主角团可用红、蓝、黄、绿、橙、紫区分个性。
数码元素可用荧光绿（代码）、亮铬色（金属）、深海蓝（核心）、极光色（进化）点缀。

【皮肤与质感】动漫清爽肌肤，轮廓线干净，阴影平整，不追求写实毛孔。

【避免】成人化暗黑造型、写实皮肤毛孔、水彩柔边、中世纪奇幻服饰、成人职业装、暗黑色调。
```

part4_reference:

```text
digital monster adventure anime costume, youth adventure wardrobe, gender follows character_profile exactly, goggles and hoodie, bright 90s anime style, clean anime silhouette, vivid saturated outfit
```

### ancient_war_epic

- label: 古装战争风
- category: cdrama
- brief: 古装战争风：古代权谋战争史诗造型，强调真实甲胄磨损、战场消耗与身份阶层；避免魔幻装饰和影楼崭新感。

```text
【美术基调】极致写实古代战争史诗造型，真人比例，影视剧组历史剧质感。

【人物造型方向】
- 皇族：礼制纹样、华贵端正、金玉配饰。
- 将军：甲胄厚重、带战场磨损、披风风尘、护心镜有刮痕。
- 谋士：克制干净、素色袍服、少配饰、带智性气场。
- 士兵：统一制式但带疲惫与尘土。
- 敌国名将：独立审美体系，不简单异域化。

【服装与材质】
粗布、皮革、铁甲、铜扣、绸缎、兽皮、木质兵器、旧旗帜；
服装必须带风尘、磨损、血迹印记、雨雪痕迹，避免影楼级崭新。

【色彩系统】
- 朝堂：玄黑、暗红、金色、深木色。
- 边关：土黄、铁灰、沙白、暗褐。
- 雪战：冷白、灰蓝、血红。
- 夜袭：黑蓝、火光橙、铁色。
- 亡国线：灰白、枯黄、暗红。

【皮肤与质感】皮肤带汗水、尘土与细小划痕，真实毛孔与岁月痕迹。

【避免】西方板甲、哥特尖盔、十字架、魔幻发光宝石、夸张巨剑、超比例翅膀、影楼式干净妆发、荧光色。
```

part4_reference:

```text
ancient Chinese war costume, historical battlefield wardrobe, worn lamellar armor, dusty banners and cloaks, realistic period fabric, weathered skin
```

### steam_cyberpunk

- label: 蒸汽赛博
- category: concept
- brief: 蒸汽赛博：蒸汽机械与赛博电子融合造型，强调黄铜义体、维多利亚剪裁与电影级材质；避免单纯复古或单纯霓虹堆砌。

```text
【美术基调】蒸汽机械 × 赛博电子融合，维多利亚剪裁与高科技改造叠加，黑色电影质感的真实材质。

【人物造型方向】
可塑角色：义体侦探、机械修女、地下黑客、蒸汽工程师、黑市医生、贵族继承人、赏金猎人。
造型混合复古剪裁与机械改造：风衣、礼帽、束腰、长靴、怀表、铜制义肢、发光义眼、神经接口、机械手套。
每件机械部件都应嵌入身份逻辑，不是装饰堆砌。

【服装与材质】
皮革、呢绒、铜、黄铜、铸铁、齿轮、玻璃镜片、管路、丝绸、蕾丝、维多利亚束腰；
义体结构可见齿轮、活塞、压力表、铜管、阀门；
赛博结构可见义眼、数据线、电子屏、神经接口。

【色彩系统】
主色：黄铜、暗金、铁锈红、墨绿、烟灰、深棕。
电子光源点缀：蓝紫、电子粉、冷青色（作为义体光源，不大面积使用）。

【皮肤与质感】皮肤真实，可见毛孔；义体接缝处有金属氧化、焊点、磨损。

【避免】纯电子光源堆砌、纯复古机械、元素堆砌、色彩明亮圆润的未来感（如守望先锋风）、木质法杖、布质披风式纯奇幻。
```

part4_reference:

```text
steam cyberpunk character design, brass prosthetics, Victorian cybernetic wardrobe, steam pipes and pressure gauges, noir material texture
```

### wasteland_cyberpunk

- label: 废土赛博
- category: concept
- brief: 废土赛博：末世生存与赛博义体融合造型，强调磨损拼装、粗粝材质与资源稀缺感；避免干净时装化与高科技圆润感。

```text
【美术基调】末世资源稀缺的废土赛博生存美学，真实磨损材质，gritty realism。

【人物造型方向】
角色范畴：荒原佣兵、义体幸存者、黑市医生、拾荒者、堡垒叛逃者、机械兽猎人、AI 信徒。
服装必须带生存痕迹：拼装、磨损、尘土、修补、焊接痕迹。
义体不能全新光滑，应有划痕、临时焊接、裸露线路、旧零件替换。

【服装与材质】
防辐射面罩、水壶、破旧护甲、能源芯片、义体接口、改装零件、旧布条、皮带、金属板拼接；
材质真实粗粝：锈蚀金属、磨旧皮革、脏布、塑料板、电路板护甲。

【色彩系统】
基础色：沙黄、铁锈、灰黑、脏白、暗红。
电子亮色作为局部点缀（义体光源、电子屏），不可大面积使用。
整体不可过于干净或鲜艳。

【皮肤与质感】皮肤干裂、灰尘附着、伤疤可见；义体接口有油污与氧化。

【避免】崭新装备、完美无瑕皮肤、时装化剪裁、守望先锋式圆润科技感、纯奇幻法杖披风、马卡龙色。
```

part4_reference:

```text
wasteland cyberpunk survival wardrobe, scavenged cybernetics, rusty patched armor, dusty weathered fabric, gritty post-apocalyptic material
```

### chinese_urban_romance

- label: 国内都市爱情
- category: realistic
- brief: 国内都市爱情：中国现代都市现实情感造型，强调真实通勤穿搭与低饱和电影质感；避免悬浮霸总和廉价影楼感。

```text
【美术基调】当代中国都市写实影视质感，低饱和电影生活感，真人皮肤纹理。

【人物造型方向】
人物造型符合职业、收入、性格、生活状态。
常见职业：律师、医生、设计师、产品经理、记者、创业者、老师、心理咨询师。
好看但不脱离生活，疲惫感与细节感比过度精致更重要。

【服装与材质】
真实通勤与生活穿搭：风衣、羊毛大衣、针织衫、衬衫、西装、棉麻、牛仔、皮带、简约配饰；
面料平整但可带自然褶皱，不影楼挺括；
鞋履与包袋体现职业与生活状态。

【色彩系统】
- 精英/冷感：高级灰、藏蓝、冷银、极简白。
- 浪漫/治愈：奶油米、莫兰迪粉、琥珀色、淡驼。
- 情绪/夜感：墨绿、深雨蓝、暖咖。
整体克制低饱和，避免偶像剧滤镜与过高对比。

【皮肤与质感】皮肤保留真实毛孔、微纹与光泽，绝不磨皮成瓷感。

【避免】悬浮霸总式浮夸西装、豪宅滤镜、廉价影楼摆拍、塑料瓷娃娃皮肤、强行高饱和、奇幻元素。
```

part4_reference:

```text
contemporary Chinese urban romance wardrobe, realistic city lifestyle outfit, muted palette, natural skin texture, restrained cinematic fabric
```

### western_urban_romance

- label: 国外都市爱情
- category: realistic
- brief: 国外都市爱情：欧美都市爱情电影造型，强调独立个体、自然轻熟穿搭与胶片级皮肤质感；避免文化混淆和旅游宣传片感。

```text
【美术基调】欧美都市爱情电影质感（类《爱乐之城》《午夜巴黎》），松弛自然的轻熟造型，胶片级皮肤纹理。

【人物造型方向】
人物独立、有职业追求与个人审美。
常见职业：作家、摄影师、建筑师、律师、音乐人、记者、厨师、策展人、创业者。
服装强调自然、轻熟、松弛、个性，避免戏剧化造型。

【服装与材质】
羊毛大衣、针织、衬衫、西装、牛仔、丝绸、麂皮、羊绒、皮带、经典皮鞋、简约首饰；
面料真实有垂感，不挺括、不影楼。

【色彩系统】
- 欧式复古：香槟金、勃艮第红、森林绿、奶油白、午夜蓝。
- 美式现代：摩天灰、牛仔蓝、砖红、焦糖色、高对比黑白。
- 情感氛围：丁香紫、桃粉、深橘、雨天灰蓝。
整体低饱和带电影生活感。

【皮肤与质感】真实毛孔、胡渣、眼周纹理，胶片颗粒感，不瓷感。

【避免】东亚古典元素混入、廉价影楼摆拍、过度液化磨皮、高饱和俗艳滤镜、奇幻超现实特效、丑陋现代小物（排插等）入镜。
```

part4_reference:

```text
western urban romance wardrobe, New York Paris London lifestyle outfit, natural tailored fashion, realistic film skin texture, low saturation palette
```

## 定妆照场景背景图

### 使用方式

- capability: PORTRAIT
- background_mode: scene
- style_key: 从上方当前风格选择器中任选一个

### 场景背景定妆照 Prompt 核心

```text
影视角色场景背景定妆照 / full-body solo character costume photo in a story-world environment。
单人，全身，正面 0 度站立，中性表情，人物站在场景背景图中央。

画面目标：单个演员/角色站在其世界观代表性场景中，场景只作为身份与世界观背景，不得抢走人物主体。人物必须完整站在画面中央，头顶到鞋底完整可见。

硬约束：
1. 仅一个完整站立人物，禁止第二个人、重复人物、第二张脸、侧面图、背面图、局部细节图、拼贴或多视图。
2. 全身入镜，从头顶、发冠、帽饰到鞋底完整可见，头顶上方与脚底下方各留约 5% 空白。
3. 人物站在场景背景图水平中央与视觉中心，肩线正对镜头，脸部正对镜头，双眼平视。
4. 中性表情与静态站姿，双手自然垂于身体两侧，露出服装轮廓、袖口、腰带、鞋靴与随身配饰。
5. 场景背景与当前 style_key、角色身份、时代和世界观一致，可包含建筑、自然环境、室内空间、城市街景、遗迹、战场或职业空间等。
6. 场景只能作为背景层，前景物、烟雾、光束、植物、家具、建筑构件不得遮挡头部、手臂、腰带、衣摆、鞋靴和随身配饰。
7. 光线以清晰展示角色为主，允许轻微环境光，但不得用强逆光、浓烟、强眩光或大面积阴影吞没人物细节。
8. 竖构图，推荐 2:3 或 3:4，角色占画面高度 72-86%，场景保留信息量但人物仍是第一视觉主体。

English anchor:
one single human subject only, full body visible from head to toe, centered in an environment background, straight-on front view, neutral standing pose, clear full costume visibility, no crop, no close-up, no collage, no character sheet, no text.
```

### 场景模式负向词重点

```text
text, watermark, logo, multiple people, duplicate person, duplicate face, close-up, headshot, bust, half body, cropped body, cropped feet, cropped head, side view, rear view, collage, multiple views, split panel, character sheet, model sheet, poster composition, cinematic still, movie scene, bokeh, shallow depth of field, strong foreground occlusion, blocking the body, dramatic action, battle pose, running, sitting, kneeling, blurry, low resolution
```
