# 常见问题

## Docker 中预检存储源时提示“目录不可写”怎么办？

### 结论

这通常不是 OmniStore 的文件操作逻辑故障，而是容器进程用户与挂载目录的属主/权限不匹配。Docker named volume 第一次创建时通常由 `root:root` 持有；OmniStore 镜像则以 UID/GID `1000:1000` 的非 root 用户运行。镜像只预置并授权系统数据目录，不会替任意 source 挂载目标修改属主。目录因此可以被读取，却不能创建文件。

### 完整链路

1. Compose 把一个 named volume 挂载到容器内的存储源目录。空 volume 首次创建时，目录一般是 `root:root`、`0755`。
2. 镜像通过 `USER omnistore` 启动服务，应用进程 UID/GID 是 `1000:1000`。
3. 管理员点击“预检目录”后，前端调用管理员 source preflight API。
4. 后端依次检查路径是否存在、是否为目录、是否触碰系统数据目录或已有 source，然后执行读写预检：列目录、创建隐藏探测文件、写入 1 字节、关闭并删除。
5. `ReadDir` 在 `0755` 下可以成功，但创建探测文件需要目录写权限，因此收到 `permission denied`。预检在创建数据库记录或扫描文件之前就结束了。
6. 现在返回给 UI 的是通用权限提示，不会回显探测文件的具体路径；原始路径不应作为用户可见的诊断信息。

### 推荐修复：为 named volume 初始化属主

对测试 volume 或确认由 OmniStore 独占管理的空 volume，可以执行一次性初始化。将 `<容器内存储源目录>` 替换为 Compose 中对应的 `target`：

```bash
docker compose run --rm --user 0:0 --entrypoint sh omnistore \
  -c 'chown 1000:1000 <容器内存储源目录> && chmod 0750 <容器内存储源目录>'
```

然后重新执行“预检目录”。不要为了绕过问题而把主服务改成 root 运行；这会扩大服务对挂载文件和系统资源的权限。不要把删除 volume 作为第一选择，`docker compose down -v` 可能删除其中的数据。

### 如果使用的是宿主机 bind mount

容器内看到的目录必须允许 UID/GID `1000:1000` 读写，并且挂载不能是只读模式。可以在宿主机上调整目录属主、所属组或 ACL；不要直接对包含其他应用数据的目录递归改属主。对于 Linux 宿主机，常见做法是让目标目录的属主 UID 与容器应用 UID 对齐：

```bash
sudo chown 1000:1000 <宿主机存储源目录>
chmod u+rwx <宿主机存储源目录>
```

宿主机目录已经由其他服务管理时，优先使用共享组或 ACL，并确认 Docker Desktop 的文件共享设置允许该目录被挂载。

### 如何验证

用与主服务相同的非 root 身份验证挂载目录即可；将占位符替换为实际的容器内目录：

```bash
docker compose run --rm --user 1000:1000 --entrypoint sh omnistore \
  -c 'test -r <容器内存储源目录> && test -w <容器内存储源目录> && echo source-permission-ok'
```

看到 `source-permission-ok` 后，预检的文件系统权限条件已满足。若仍失败，再检查路径是否为只读挂载、是否被已有 source 或系统数据目录规则拒绝，以及挂载目录的子目录/文件权限是否阻止后续操作。
