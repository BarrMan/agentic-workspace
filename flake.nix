{
  description = "AgenticWorkspace - A markdown-based task management CLI tool";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix = {
      url = "github:nix-community/bun2nix/2.1.1";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      bun2nix,
      ...
    }:
    flake-utils.lib.eachSystem
      [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ]
      (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ bun2nix.overlays.default ];
          };
          # Update this version and every archive hash together when changing Bun.
          pinnedBunVersion = "1.4.3";
          standardBun = pkgs.bun.overrideAttrs (bun: {
            version = pinnedBunVersion;
            passthru = bun.passthru // {
              sources = bun.passthru.sources // {
                x86_64-linux = pkgs.fetchurl {
                  url = "https://github.com/oven-sh/bun/releases/download/bun-v${pinnedBunVersion}/bun-linux-x64.zip";
                  sha256 = "3e730528d89775f03f87f05c06787c4df4099d0a37f3f252e7b829cb23816e18";
                };
                aarch64-linux = pkgs.fetchurl {
                  url = "https://github.com/oven-sh/bun/releases/download/bun-v${pinnedBunVersion}/bun-linux-aarch64.zip";
                  sha256 = "efa9813da5ed72423bf847f916e8d2c47c0d776add972354026a75e10da9aa21";
                };
                aarch64-darwin = pkgs.fetchurl {
                  url = "https://github.com/oven-sh/bun/releases/download/bun-v${pinnedBunVersion}/bun-darwin-aarch64.zip";
                  sha256 = "80afd4c069b46a6fa8f3ec520bebc750a7843e4a8d5b9583d29ad436c00a3403";
                };
              };
            };
          });
          avx2BunArchive = pkgs.fetchurl {
            # Pin an AVX2-only control independently of the packaged Bun runtime.
            url = "https://github.com/oven-sh/bun/releases/download/bun-v${pinnedBunVersion}/bun-linux-x64.zip";
            sha256 = "3e730528d89775f03f87f05c06787c4df4099d0a37f3f252e7b829cb23816e18";
          };
          packageJson = builtins.fromJSON (builtins.readFile ./package.json);
          bunDeps = pkgs.bun2nix.fetchBunDeps {
            bunNix = ./bun.nix;
          };
          bunRuntime =
            if system == "x86_64-linux" then
              standardBun.overrideAttrs (bun: {
                passthru = bun.passthru // {
                  sources = bun.passthru.sources // {
                    x86_64-linux = pkgs.fetchurl {
                      # Keep this on Bun's baseline archive. The normal x64 build requires AVX2.
                      url = "https://github.com/oven-sh/bun/releases/download/bun-v${pinnedBunVersion}/bun-linux-x64-baseline.zip";
                      sha256 = "1fc2edac843102909e3a1be1d8d9802cc6071cf074e67e88231f4ffe0f8b397b";
                    };
                  };
                };
              })
            else
              standardBun;
          agentic-workspace = assert standardBun.version == pinnedBunVersion;
            pkgs.bun2nix.mkDerivation {
            pname = "agentic-workspace";
            inherit (packageJson) version;
            src = ./.;

            inherit bunDeps;
            nativeBuildInputs = [
              bunRuntime
              pkgs.makeWrapper
            ];
            bunInstallFlags = [
              "--linker=isolated"
              "--backend=copyfile"
            ];
            dontRunLifecycleScripts = true;
            dontUseBunCheck = true;
            postBunSetInstallCacheDirPhase = ''
              export PATH=${bunRuntime}/bin:$PATH
            '';

            buildPhase = ''
              runHook preBuild

              AGENTIC_WORKSPACE_BUILD_VERSION="$version" \
                AGENTIC_WORKSPACE_BUILD_OUTDIR=dist/nix \
                ${bunRuntime}/bin/bun scripts/build.ts

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p "$out/lib/agentic-workspace"
              cp -R dist/nix/. "$out/lib/agentic-workspace/"
              makeWrapper ${bunRuntime}/bin/bun "$out/bin/agentic-workspace" \
                --add-flags "$out/lib/agentic-workspace/index.js" \
                --set AGENTIC_WORKSPACE_BUNDLE_ASSET_DIR "$out/lib/agentic-workspace"

              runHook postInstall
            '';

            doInstallCheck = true;
            # The packaged browser smoke binds localhost inside the Darwin sandbox.
            __darwinAllowLocalNetworking = pkgs.stdenv.hostPlatform.isDarwin;
            nativeInstallCheckInputs = pkgs.lib.optionals (system == "x86_64-linux") [
              pkgs.qemu-user
              pkgs.unzip
            ];
            installCheckPhase = ''
              runHook preInstallCheck

              ${bunRuntime}/bin/bun scripts/smoke-compiled-build.ts "$out/bin/agentic-workspace" "$version"

              ${pkgs.lib.optionalString (system == "x86_64-linux") ''
                mkdir -p "$TMPDIR/avx2-bun"
                unzip -q ${avx2BunArchive} -d "$TMPDIR/avx2-bun"
                ln -s ${pkgs.stdenv.cc.libc}/lib "$TMPDIR/avx2-bun/lib64"

                set +e
                BUN_JSC_useJIT=false qemu-x86_64 -L "$TMPDIR/avx2-bun" -cpu IvyBridge \
                  "$TMPDIR/avx2-bun/bun-linux-x64/bun" --version >/dev/null 2>&1
                avx2_status=$?
                set -e
                if [ "$avx2_status" -ne 132 ]; then
                  echo "QEMU compatibility check expected AVX2 Bun to exit 132, got $avx2_status" >&2
                  exit 1
                fi

                test "$(BUN_JSC_useJIT=false qemu-x86_64 -cpu IvyBridge ${bunRuntime}/bin/bun "$out/lib/agentic-workspace/index.js" --version)" = "$version"
                BUN_JSC_useJIT=false qemu-x86_64 -cpu IvyBridge \
                  ${bunRuntime}/bin/bun "$out/lib/agentic-workspace/index.js" --help >/dev/null
              ''}

              runHook postInstallCheck
            '';

            meta = {
              description = "A markdown-based task management CLI tool with Kanban board";
              homepage = "https://github.com/BarrMan/agentic-workspace";
              changelog = "https://github.com/BarrMan/agentic-workspace/releases";
              license = pkgs.lib.licenses.mit;
              mainProgram = "agentic-workspace";
            };
          };
        in
        {
          packages = {
            default = agentic-workspace;
            agentic-workspace = agentic-workspace;
          };

          apps.default = flake-utils.lib.mkApp {
            drv = agentic-workspace;
            name = "agentic-workspace";
          };

          devShells.default = pkgs.mkShell {
            packages = [
              bunRuntime
              pkgs.bun2nix
              pkgs.nodejs_24
              pkgs.git
              pkgs.biome
            ];
          };
        }
      );
}
