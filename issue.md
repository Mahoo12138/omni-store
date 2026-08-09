我把当前 main 按“1.0 稳定版发布审计”看了一遍。先说结论：现在的代码质量已经不是“明显没做完”的状态，最新 HEAD 15ce146 的 GitHub Actions 也已经完整跑绿；但我暂时不建议直接打 v1.0.0 stable tag。 主要原因不是 UI、代码风格或者测试数量，而是我找到了几处可能造成权限事故、账号生命周期断裂或数据状态不一致的真正 release blocker。

其中我认为发布前优先级应该这样排：

P0：公开文件 / 分享文件存在同源 Stored XSS 风险。 这是我认为目前最严重的问题。公开网盘 /raw/... 和分享 /share/.../raw 默认都是 Content-Disposition: inline，随后直接 http.ServeContent。也就是说，普通用户完全可以上传一个 attack.html，创建分享，再让已登录管理员打开这个链接，HTML 会在 OmniStore 自己的 Origin 下运行。
更关键的是 /api/v1/auth/me 同样位于这个 Origin，而且 GET 后还会返回新的 CSRF Token，因此同源恶意 JS 不需要读取 HttpOnly Cookie，也能携带 Cookie 调 API、拿 CSRF，再尝试调用管理员接口。 当前全局 middleware 也没有 CSP / nosniff 这样的内容隔离。
1.0 前至少应该做到：HTML / SVG / XML / JS 等主动内容永远 attachment；增加 X-Content-Type-Options: nosniff；更理想的是把用户原始内容放到单独的无 Cookie 域名，比如 files.example.com。私有下载现在强制 attachment，这部分反而是对的。
P0：删除用户这个业务现在实际上没有闭环。 SQLite 明确启用了 foreign key。 但 images.owner_user_id -> users.id 和 audit_logs.actor_user_id -> users.id 都没有 ON DELETE SET NULL/CASCADE。
而 users.Delete() 只清 Session、Token、S3 凭据、Policy、Preference，并把 file_records 变成 unowned；它没有处理 images 和 audit_logs。 所以在常规开启审计的情况下，一个用户只要成功登录过留下审计记录，或者上传过图床图片，就可能导致管理员“删除用户”直接 FK constraint failed。现有用户生命周期测试没发现，是因为测试删除的是一个没有这些关联记录的用户。
我的建议是：audit 一律 SET NULL 保留历史；图片则明确产品语义——删账号后图片继续公开就 owner_user_id = NULL 并转为 orphan/system 管理，否则就执行完整图片删除流程。
P0：首次管理员初始化存在“抢占 + 并发双管理员”问题。 /api/v1/setup/admin 是公开接口，逻辑是先 COUNT(users)，看到 0 后再调用 Create()，这两个操作不是一个原子事务。 而默认监听 0.0.0.0:8080，Docker Compose 也是直接 8080:8080。
所以新部署如果先暴露公网，理论上别人可以先你一步注册超级管理员；两个不同用户名的并发请求也可能都在 COUNT=0 时通过。建议引入一次性 bootstrap secret / CLI 初始化，至少也必须把“仅允许第一个用户”变成数据库原子约束，并补一个 20~100 并发初始化测试，最终只能存在一个管理员。
P0：迁移系统现在还停留在“1.0 尚未发布”的特殊模式，打 stable 前必须收口。 internal/db/migrate.go 里明确写着 v1.0.0 尚未发布，并且对 v1.0.0 做特殊处理：即使 schema_migrations 已经记录了它，也会继续重放 baseline；启动时还会执行一系列 pre-release schema 修正。
开发期这么做很方便，但 v1.0.0 一旦正式发布，baseline 就必须冻结。否则到 1.0.1 / 1.1.0 后依旧不断重放 v1.0 SQL，是很危险的长期技术债。建议发布提交里正式移除 initialMigrationVersion 特判：已 applied 的 migration 永远不再执行，之后所有结构变化只追加新 migration。
P0：你的“发布门禁”和 GitHub 真正执行的门禁不是同一套。 scripts/release-check.sh 其实做得不错：gofmt、go vet、测试、默认 52% Go coverage、前端测试、Playwright、release binary、amd64/arm64、Compose config、git diff 都会检查。
但 tag workflow 并没有执行这个脚本；它主要跑 pnpm test/build + go vet/test + Playwright，然后 tag 就可以继续构建并发布 image / binary / GitHub Release。 所以理论上一个不满足你自己 release-check 标准的 commit 仍然能发布 stable。建议把验证逻辑抽成唯一的 verify-release，本地与 CI 共用，并在 v* 发布 job 前硬依赖它。我还建议加一次 go test -race ./...，你现在配额、锁、初始化、跨源操作的并发逻辑已经足够复杂了。
P0/P1：存储源本身还有一个并发不变量漏洞。 Create() 会先查询全部现有 root，再做 ValidateRootPath() 判断是否重叠，之后才打开事务写 storage_sources。 两个并发创建请求完全可能同时看到“没有冲突”，然后把同一个目录或父子目录都注册成 Storage Source。数据库里的 root_path 也没有 UNIQUE 能兜底。对于一个直接操作真实文件系统的程序，这会造成两个逻辑源同时操作同一批文件。建议对“存储源拓扑变更”加全局锁，在锁内重新读取、校验、写入。
P1：所谓“系统配置备份”目前不是一个完整可恢复快照。 现在导出的是完整 SQLite VACUUM INTO + effective config + keys，但明确不包含真实存储文件、cache、temporary uploads。 问题在于 SQLite 本身又包含一些依赖外部 payload 的状态：回收站 metadata 对应 data/trash 实体、S3 multipart metadata 对应临时 part；同时还会把活跃 Web Session、share access session 一并备份。
所以恢复后可能出现“回收站里显示有东西但 payload 不存在”“multipart 有数据库状态但分片丢了”，甚至旧 Session 被恢复后重新有效。现有备份测试只验证 ZIP 中有 DB/config/key，并没有做一次真实 restore 后的一致性验证。
我会把它明确定位成“系统配置导出”，并在副本数据库里清掉 session、share session、multipart transient state；或者真正做“系统备份”，那就必须把 trash 等配套状态也纳入。
P1：账号被盗后的“恢复闭环”还不够完整。 普通修改密码只是替换 password_hash，不会注销其他 Web Session。 Sessions 已经有 DeleteByUser 能力。 建议密码修改成功后至少注销其他 Session；管理员还应该有一次性的“撤销该账号所有凭据”能力，把 Session、WebDAV Token、图床 Token、S3 Key 全部作废。否则用户怀疑账号泄漏时，没有真正的一键止损手段。
另外 /auth/me 每调用一次都会 destructive rotate CSRF token。 多标签页并行初始化时，一个 tab 很容易让另一个 tab 手里的 CSRF 立即失效。建议一个 Session 使用稳定 CSRF token，不要通过普通 GET 轮换。
P1：登录防爆破还缺一层，而且现在的 timing equalization 有瑕疵。 用户真实密码统一 bcrypt cost 12。 但是不存在用户名时，用来制造等价耗时的 dummy hash 是 $2a$10$...，也就是 cost 10。 两者工作量大约差 4 倍，反而可能重新产生用户名枚举的时间侧信道。同时 login 没有限流。匿名图床已经实现了 IP limiter，登录入口也应该至少做 IP + username 的失败频率限制。
P1：文件系统操作和 SQLite 事务之间缺少 crash-recovery 闭环。 例如 MoveToTrash 是先开启 DB transaction、更新记录，再物理 move 文件，最后 commit；正常 Go error 可以补偿，但如果进程在“文件已移动、DB 尚未 commit”的几毫秒内断电/kill，DB 会 rollback，文件却已经离开原位置。 跨源 Move 也存在类似的“copy → DB sync → delete source”多阶段窗口。 图床上传也是先写 images 记录，再 rename 文件，再更新 ledger。
真正成熟的办法是加一个很小的 durable operation journal，例如 pending_trash / pending_move / pending_upload，启动时完成或回滚未完成操作。1.0 如果不想做完整 journal，至少做启动时 reconcile / orphan 检测。
P1：存储源创建逻辑发生了一个值得你重新确认的产品漂移。 现在代码允许挂载非空目录，Preflight 只是展示内容和 warning，Create 本身甚至不强制用户先走 Preflight；创建完成后 Reconcile 还是另一个独立管理员动作。当前前端 API也把 reconcile 暴露成手动操作。
这和我们前面为 OmniStore 定下的“新建 Storage Source 必须是空目录”的不变量已经不一致。如果你现在确实决定 1.0 支持已有目录导入，那没问题，但我建议把它变成显式的 import_existing=true 流程：Preflight → 明确确认 → 创建 → 自动 reconcile → ready，而不是允许 API 直接跳过预检。否则用户以为“加了一个目录”就完全被系统纳管，但搜索、owner、quota ledger 可能还没校准。
P2：安全配置和测试体系可以在 1.0 后继续收紧，但最好现在补几个低成本项。 数据目录/DB bare-metal 模式建议显式 0700/0600，而不是主要依赖 umask；SQLite 里现在毕竟包含密码 hash 和 raw Session ID。 此外目前浏览器 E2E 已经覆盖认证、文件生命周期、文件操作、图床、路径权限、公开盘、分享和配置导出，但没有 trash/search/WebDAV/S3/quota/user-delete 这些跨模块场景。 52% 的全局覆盖率门槛也容易掩盖安全关键包覆盖不足，后面可以改成关键 package 单独设门槛。

整体上，我认为 OmniStore 目前的问题不是“功能没闭环很多”，恰恰相反，绝大多数主体业务已经形成体系了：权限统一到了 Policy，Web/ WebDAV / S3 复用核心文件层，配额有锁，回收站会同步台账和分享，跨源移动会迁移 image/share 元数据，这些设计方向是对的。

真正还差的是“系统生命周期闭环”：首次安装 → 正常运行 → 权限变化 → 删除用户 → 删除存储源 → 凭据泄漏恢复 → 进程异常崩溃 → 备份恢复 → 1.0 升级到 1.0.1。现在 Happy Path 已经比较完整，但这些“非 Happy Path”里还藏着几个足以影响 stable 口碑的问题。

如果按发布节奏来，我会先修 同源 XSS、用户删除 FK、首次初始化、迁移冻结、发布门禁、存储源并发创建 这 6 个，然后打 v1.0.0-rc.1；其余 P1 在 RC 阶段集中验证。做到这一步，我会认为它已经具备正式 1.0.0 的基础，而不是继续无休止加功能。