<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# First VPS Deployment Runbook

Created: 2026-05-11
Example hostname: `vote.example.com`

## Purpose

This runbook captures a practical Ubuntu 24.04 LTS VPS deployment path for the app.

The first VPS deployment path was tested on Ubuntu Server 24.04 LTS. The architecture is not Ubuntu-specific and should apply to common Linux server distributions such as Debian, AlmaLinux, Rocky Linux, and similar VPS images, with expected differences around package installation, firewall tooling, service management defaults, and Podman/Compose packaging.

The goal is a safe alpha baseline:
- SSH key access
- firewall enabled
- root SSH disabled
- only `22`, `80`, and `443` exposed publicly
- app running behind Caddy
- HTTPS certificate issued and renewed automatically
- default app secrets replaced before public use

## Important Current Caveats

The packaged compose file should publish the app only on host-local `127.0.0.1:3001`.

For a real VPS, do not open public firewall access to port `3001`. Caddy should be the public entrypoint on `80` and `443`, and it should reverse proxy to `127.0.0.1:3001`.

Before broad public use, rehearse backup/restore and decide how deployment-local config should be preserved across updates.

The shipped compose/deployment defaults should keep the dev-only simulator API disabled. This is separate from the in-app super-admin demo mode: demo mode may still be enabled later for operator-controlled large-room testing without exposing the simulator login/bootstrap endpoints on the VPS by default.

This public runbook covers the normal self-hosted server path only.

## 1. First SSH Login

From the local machine:

```bash
ssh root@YOUR_SERVER_IP
```

Update the server:

```bash
apt update
apt upgrade -y
reboot
```

Reconnect after reboot:

```bash
ssh root@YOUR_SERVER_IP
```

Create a normal admin user:

```bash
adduser deploy
usermod -aG sudo deploy
```

Copy the local SSH key to the new user:

```bash
ssh-copy-id deploy@YOUR_SERVER_IP
```

Test before locking anything down:

```bash
ssh deploy@YOUR_SERVER_IP
sudo whoami
```

Expected output:

```text
root
```

## 2. Firewall

On the VPS:

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Do not allow `3001/tcp` publicly.

If your VPS provider provides a separate cloud firewall/security-rules layer, match it to the same intent:

```text
22/tcp
80/tcp
443/tcp
```

## 3. SSH Hardening

Only continue after confirming `deploy@YOUR_SERVER_IP` works.

Edit SSH config:

```bash
sudo nano /etc/ssh/sshd_config
```

Set or add:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Reload SSH:

```bash
sudo systemctl reload ssh
```

Keep the current SSH session open and test a second login from the local machine:

```bash
ssh deploy@YOUR_SERVER_IP
```

## 4. Basic Security Packages

```bash
sudo apt install -y unattended-upgrades fail2ban curl git ca-certificates
sudo dpkg-reconfigure unattended-upgrades
sudo systemctl enable --now fail2ban
```

## 5. Install Runtime Tools

```bash
sudo apt install -y podman podman-compose caddy
podman --version
podman-compose --version
caddy version
```

## 6. DNS

The app should use a subdomain so the root domain remains available for a future landing page, documentation site, or marketing website.

In your DNS provider, create an `A` record for the app subdomain:

```text
Type: A
Host: vote
Answer/Value: YOUR_SERVER_IP
TTL: default / automatic
```

Wait until this works from the local machine:

```bash
dig +short vote.example.com
```

Expected output:

```text
YOUR_SERVER_IP
```

## 7. HTTPS Certificate

Use Let's Encrypt certificates through Caddy.

This is the cheap and fast path:
- Let's Encrypt is free.
- Caddy obtains certificates automatically.
- Caddy renews certificates automatically.
- Caddy redirects HTTP to HTTPS automatically for normal domain-based sites.

References:
- https://letsencrypt.org/
- https://caddyserver.com/docs/automatic-https

Edit the Caddy config:

```bash
sudo nano /etc/caddy/Caddyfile
```

Use:

```caddyfile
vote.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

Validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

Caddy can only get a public certificate after:
- the DNS record points to the VPS
- public port `80` is reachable
- public port `443` is reachable
- no other service conflicts with Caddy on those ports

During the first test bring-up, keep the Caddy config simple. Do the stricter HTTP-to-HTTPS finalization only after the deployment, login, board, persistence, and restart checks pass.

## 8. Deploy The App

### GitHub Access

If the repository is private, the VPS needs read access before `git clone` can work. If the repository is already public, you can skip the deploy-key/token setup and clone it normally.

Recommended path: use a read-only GitHub deploy key dedicated to this server and this repository. GitHub documents deploy keys as SSH keys attached directly to one repository; they are read-only by default unless write access is explicitly enabled.

Reference:
- https://docs.github.com/authentication/connecting-to-github-with-ssh/managing-deploy-keys

On the VPS, logged in as `deploy`, create a dedicated key:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "vote.example.com deploy key" -f ~/.ssh/opavotingtool_deploy -N ""
cat ~/.ssh/opavotingtool_deploy.pub
```

In GitHub:
- open the repository
- go to `Settings -> Deploy keys`
- choose `Add deploy key`
- title it `vote.example.com alpha VPS`
- paste the public key from `~/.ssh/opavotingtool_deploy.pub`
- do not enable write access
- save the deploy key

Back on the VPS, create an SSH alias so this repo uses the deploy key:

```bash
nano ~/.ssh/config
```

Add:

```sshconfig
Host github-opavotingtool
    HostName github.com
    User git
    IdentityFile ~/.ssh/opavotingtool_deploy
    IdentitiesOnly yes
```

Lock down the SSH files:

```bash
chmod 700 ~/.ssh
chmod 400 ~/.ssh/opavotingtool_deploy
chmod 600 ~/.ssh/opavotingtool_deploy.pub ~/.ssh/config
ssh -T git@github-opavotingtool
```

The SSH test may say that GitHub does not provide shell access. That is normal if it also recognizes the key or does not fail with `Permission denied`.

If SSH warns `UNPROTECTED PRIVATE KEY FILE`, re-run the `chmod` commands above and confirm the private key is not group-readable or world-readable.

Fallback path: use a fine-grained personal access token if you prefer HTTPS or only need a quick manual clone.

GitHub recommends fine-grained personal access tokens over classic tokens when possible. Create one with:
- resource owner: the account or organization that owns the repo
- repository access: only this repository
- repository permissions: `Contents: Read-only`
- expiration: short, for example `7` or `30` days during alpha setup

Reference:
- https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token

When Git asks during HTTPS clone:
- username: your GitHub username
- password: paste the token, not your GitHub password

Do not put the token directly into the clone URL, because that can leak into shell history and Git remote configuration.

On the VPS:

```bash
sudo mkdir -p /opt/opa-voting-tool
sudo chown deploy:deploy /opt/opa-voting-tool
cd /opt/opa-voting-tool
git clone git@github-opavotingtool:YOUR_GITHUB_OWNER/YOUR_REPO_NAME.git app
cd app
```

If using the HTTPS token fallback instead of the deploy key, replace the clone command with:

```bash
git clone https://github.com/YOUR_GITHUB_OWNER/YOUR_REPO_NAME.git app
```

If the repository is public, a normal HTTPS clone is enough:

```bash
git clone https://github.com/YOUR_GITHUB_OWNER/YOUR_REPO_NAME.git app
```

Before building, create and edit the ignored deployment-local config:

```bash
./deploy.sh config:migrate
./deploy.sh config:edit
nano config/allowed-domains.txt
```

At minimum change:

```toml
[app]
base_url = "https://vote.example.com"

[admin]
username = "your-real-admin-username"
password = "a-long-random-password"
display_name = "Your Name"
```

Then build and run fresh:

```bash
./deploy.sh rebuild
```

Default keep-alive behavior after the first real deployed run:
- `./deploy.sh rebuild`, `./deploy.sh up`, `./deploy.sh restart`, `./deploy.sh restore`, and `./deploy.sh update` try to install automatic startup plus watchdog automatically
- the helper prefers a user-level `systemd` backend when available and falls back to `cron` otherwise
- in the normal case, you do not need a separate post-install keep-alive command
- if you intentionally want to turn that layer off later, run `./deploy.sh startup:disable`
- to turn it back on, run `./deploy.sh startup:enable`

On later updates or shutdowns, after the stack exists, stop it with:

```bash
./deploy.sh down
```

The deployed-state helper is intentionally separate from `./dev.sh`. Use `./deploy.sh help` on the VPS for the short operator command list.

Verify locally on the VPS:

```bash
./deploy.sh health
./deploy.sh startup:status
./deploy.sh watchdog:status
```

Verify publicly:

```bash
./deploy.sh public-health
```

Open the app:

```text
https://vote.example.com
```

## 9. First Manual Smoke Test

After the app opens through HTTPS:
- sign in as the configured super-admin
- confirm default credentials were replaced
- confirm debug tools are disabled
- create or access a team
- start a round
- vote
- reveal
- refresh the page and confirm state survives
- restart the stack and confirm state survives

Restart check:

```bash
./deploy.sh restart
./deploy.sh public-health
```

## 10. Operational Checks

Check app containers:

```bash
./deploy.sh ps
```

Check app logs:

```bash
./deploy.sh logs
```

Follow app logs:

```bash
./deploy.sh logs:follow
```

Check Caddy:

```bash
./deploy.sh caddy:status
./deploy.sh caddy:logs
```

Check disk space:

```bash
df -h
```

Check firewall:

```bash
sudo ufw status verbose
```

### Deploy A New Release

After the initial deployment is working, use the short deployed-state update path for future releases:

```bash
ssh deploy@YOUR_SERVER_IP
cd /opt/opa-voting-tool/app
./deploy.sh update
./deploy.sh public-health
```

What `./deploy.sh update` does:
- preserves deployment-local settings in ignored `config/deployment.local.toml`
- preserves ignored keep-alive overrides in `config/deploy.local.toml`
- creates a timestamped backup first
- lets you prune old update backups later with `./deploy.sh backup:prune`
- runs `git pull --ff-only`
- rebuilds the container image with `--no-cache`
- recreates the service with the latest image
- waits for local health on `127.0.0.1:3001`
- re-applies the configured automatic startup/watchdog backend when the default keep-alive layer is enabled

After every update:
- open `https://vote.example.com`
- sign in
- open a team
- start a round
- vote and reveal
- refresh and confirm state survives

If the update looks unhealthy, diagnose before changing Caddy or firewall settings:

```bash
./deploy.sh diagnose
./deploy.sh logs
./deploy.sh caddy:logs
```

For ongoing operator visibility, also run:

```bash
./deploy.sh usage
```

### Backup And Restore Rehearsal

Use the test VPS or another disposable deployment before trusting restore in a real production environment.

Browser setup:
- create a baseline team named `BACKUP_BASELINE_KEEP_ME`

Create and list the backup:

```bash
cd /opt/opa-voting-tool/app
./deploy.sh backup
./deploy.sh backup:list
```

Browser change after the backup:
- create another team named `RESTORE_TEST_SHOULD_DISAPPEAR`
- confirm both teams are visible before restore

Restore the backup:

```bash
./deploy.sh restore ../backups/<backup-file>.tar.gz
./deploy.sh public-health
```

The restore command is intentionally destructive. It stops the app, overwrites the configured Podman data volume, restores deployment config/branding files included in the archive, starts the app again, and waits for local health. It asks for `RESTORE` confirmation unless `DEPLOY_RESTORE_CONFIRM=1` is set for an automated rehearsal.

Browser verification after restore:
- `BACKUP_BASELINE_KEEP_ME` should still exist
- `RESTORE_TEST_SHOULD_DISAPPEAR` should be gone
- login, open a team, vote, reveal, and refresh once

Backup retention:

```bash
BACKUP_PRUNE_DRY_RUN=1 ./deploy.sh backup:prune
./deploy.sh backup:prune
```

`backup:prune` keeps the newest `20` archives by default and deletes older `planning-poker-backup-*.tar.gz` files from `BACKUP_DIR`. Set `BACKUP_PRUNE_KEEP=10` or another positive number to change that retention count.

## 11. Final Transition To HTTPS-Only App Access

Do this at the end of the first deployment session, after all basic app checks have passed:
- DNS resolves correctly
- Caddy has issued the certificate
- `https://vote.example.com/health` works
- sign-in works
- board create/open/vote/reveal works
- refresh preserves state
- stop/start preserves state
- the internal app port is not opened in UFW or the provider firewall

Target final behavior:
- app content is served over HTTPS only
- Caddy may listen on plain HTTP port `80` for ACME/certificate automation and redirect
- plain HTTP should redirect to HTTPS and should not serve a usable app page
- the app's internal port `3001` should not be publicly reachable
- once the HTTPS host is stable, add HSTS so browsers remember to use HTTPS

Optional stricter Caddyfile after the host is stable:

```caddyfile
vote.example.com {
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    reverse_proxy 127.0.0.1:3001
}
```

Validate and reload:

```bash
./deploy.sh caddy:reload
```

Check that plain HTTP does not serve app content:

```bash
curl -I http://vote.example.com
```

Expected result:
- a redirect to `https://vote.example.com`, usually `301`, `302`, or `308`
- no usable app page over plain HTTP

Check HTTPS still works:

```bash
./deploy.sh public-health
```

### If HTTPS Returns 502 After Caddy Reload

A `502` after `sudo systemctl reload caddy` does not automatically mean the Caddy config is wrong. In the first VPS run, Caddy validation and reload succeeded, but the app container had exited, so Caddy correctly reported that it could not connect to `127.0.0.1:3001`.

Diagnose the upstream first:

```bash
curl -v http://127.0.0.1:3001/health
ss -ltnp | grep ':3001'
podman ps -a --format "{{.Names}}  {{.Status}}  {{.Ports}}"
./deploy.sh logs
sudo journalctl -u caddy -n 100 --no-pager
```

If the app container is exited, bring it back up:

```bash
cd /opt/opa-voting-tool/app
./deploy.sh up
./deploy.sh public-health
```

The first observed root cause during the alpha VPS setup was an app container exit, not a broken Caddy config. Keep the diagnosis order simple: check app health, check container status/logs, then check Caddy.

## 12. Operator Follow-Up Items

Before treating a VPS as a polished public deployment, rehearse or schedule:
- `./deploy.sh backup` / `./deploy.sh restore <file>` on a non-production target or maintenance window
- deployment-local config preservation across `git pull` / `./deploy.sh update`
- persistent managed branding strategy
- server monitoring checklist for disk, Caddy, container logs, certificate renewal, and basic resource usage
- deployed performance smoke checks before inviting broader testers
