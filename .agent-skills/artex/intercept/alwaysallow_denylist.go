package intercept

import (
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"strings"
)

// alwaysAllowDenylist holds the programs an argv allow rule may never name:
// with flags unconstrained, an allow rule for one of them runs arbitrary code
// or does unbounded damage. It is code-owned on purpose (no setting, no env
// var). Names are compared after argvProgramName: basename, lower case, no
// version suffix (python3.11 -> python, mkfs.ext4 -> mkfs).
var alwaysAllowDenylist = func() map[string]bool {
	m := map[string]bool{}
	for _, group := range []string{
		// interpreters and shells
		"sh bash zsh dash ksh fish csh tcsh ash mksh rbash pwsh powershell python pypy ipython perl ruby irb " +
			"node deno bun php lua luajit rscript tclsh wish expect awk gawk mawk nawk sed jshell osascript",
		// launchers: run their arguments (or a flag's value) as a command
		"env command builtin exec eval source . nohup timeout nice ionice stdbuf setsid chroot unshare nsenter " +
			"systemd-run su sudo doas pkexec runuser setpriv sg watch busybox toybox xargs parallel make gmake " +
			"mapfile trap script find ssh scp sftp rsync socat ncat nc netcat flock strace ltrace gdb " +
			"taskset chrt unbuffer rlwrap firejail bwrap proot proxychains torsocks tar zip vim vi nvim emacs less more man",
		// package managers and build tools: run package scripts and hooks
		"npm npx pnpm yarn bunx corepack pip pipx uv uvx poetry conda composer gem bundle bundler rake cargo go " +
			"mvn gradle dotnet apt apt-get dpkg dnf yum rpm pacman apk brew snap flatpak",
		// version control and build generators: run hooks, aliases and script files
		"git cmake ctest cpack",
		// orchestration: run images, playbooks and plans
		"docker docker-compose podman nerdctl kubectl helm ansible ansible-playbook terraform pulumi vagrant",
		// destructive
		"rm dd mkfs mkswap wipefs fdisk sfdisk parted shred truncate chmod chown kill pkill killall systemctl service " +
			"iptables ip6tables nft ufw mount umount swapoff shutdown reboot poweroff halt init telinit crontab " +
			"insmod rmmod modprobe",
	} {
		for _, name := range strings.Fields(group) {
			m[name] = true
		}
	}
	return m
}()

// argvProgramName normalises a program token for the denylist: the basename,
// in lower case, without a trailing version (python3.11, php8.2, perl5, pip3)
// and with every mkfs.* variant reduced to mkfs.
func argvProgramName(tok string) string {
	name := strings.ToLower(path.Base(tok))
	if strings.HasPrefix(name, "mkfs.") {
		return "mkfs"
	}
	// Strip a trailing run of digits and dots, but only after a letter, so a
	// name made only of digits (or ".") is kept as is.
	end := len(name)
	for end > 0 && (name[end-1] == '.' || (name[end-1] >= '0' && name[end-1] <= '9')) {
		end--
	}
	if end > 0 && end < len(name) {
		return name[:end]
	}
	return name
}

// ArgvAllowDenied reports whether an argv allow rule whose first token is
// program is refused by the denylist.
func ArgvAllowDenied(program string) bool {
	return alwaysAllowDenylist[argvProgramName(program)]
}

// CheckArgvAllow returns the error shown when an allow rule (manual or from
// "always allow") names a denylisted program, nil otherwise.
func CheckArgvAllow(tokens []string) error {
	if len(tokens) > 0 && ArgvAllowDenied(tokens[0]) {
		return fmt.Errorf("program %q cannot be always allowed: it can run arbitrary code or cause unbounded damage whatever its arguments", tokens[0])
	}
	return nil
}

// AlwaysAllowPrefix derives the argv pattern an "always allow" of a pending
// call would create: Bash only, one simple command, a non-empty prefix whose
// program is not denylisted.
func AlwaysAllowPrefix(toolName string, input []byte) ([]string, error) {
	if toolName != "Bash" {
		return nil, errors.New("always allow applies to Bash commands only")
	}
	var in struct {
		Command string `json:"command"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("the tool input is not a Bash call: %w", err)
	}
	prefix, err := ArgvPrefix(in.Command)
	if err != nil {
		return nil, fmt.Errorf("no prefix can be derived from this command: %w", err)
	}
	if len(prefix) == 0 {
		return nil, errors.New("no prefix can be derived from this command")
	}
	if err := CheckArgvAllow(prefix); err != nil {
		return nil, err
	}
	return prefix, nil
}
