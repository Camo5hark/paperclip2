const startTime = Date.now()

console.info("paperclip v2.0")
console.info("Loading libraries...")

const fs = require("fs")
const https = require("https")
const crypto = require("crypto")

console.info("Loading config...")

const config = JSON.parse(fs.readFileSync("paperclip_config.json").toString())
const buildsUrl = "https://api.papermc.io/v2/projects/paper/version_group/" + config.minecraftVersion.major + "/builds"
const mcVersion = config.minecraftVersion.major + "." + config.minecraftVersion.minor

console.info("Configuration > Builds URL: " + buildsUrl + ", Minecraft version: " + mcVersion + " - Fetching builds JSON...")

function httpsInfo(url) {
    console.info("HTTPS GET: " + url)
}

function httpsFailure(url, res) {
    const failure = res.statusCode != 200

    if (failure) console.error("HTTPS error > URL: " + url + ", Status: " + res.statusCode + ", Message: " + res.statusMessage)

    return failure
}

function httpsError(url, err) {
    console.error("HTTPS error > URL: " + url + ", Message: " + err)
}

var latestCompatBuildSha256

function verifyBuildFile(filename) {
    return fs.existsSync(filename) && crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex") === latestCompatBuildSha256
}

var foTemp

function closeTempFile(onEnd) {
    foTemp.close(err => {
        if (err) {
            console.error("Temp file close error: " + err)

            return
        }

        onEnd()
    })
}

function deleteTempFile(onEnd) {
    console.info("Cleaning up...")

    closeTempFile(() => {
        fs.unlinkSync(config.tempFile)

        onEnd()
    })
}

function finishSuccessfully() {
    deleteTempFile(() => console.info("Paperclip finished successfully (" + ((Date.now() - startTime) / 1000) + "s)"))
}

https.get(buildsUrl, res => {
    httpsInfo(buildsUrl)

    var content = ""

    res.on("data", chunk => content += chunk)
    res.on("end", () => {
        if (httpsFailure(buildsUrl, res)) return

        console.info("Builds JSON retrieved - parsing JSON...")

        const builds = JSON.parse(content)

        if (!builds.versions) {
            console.error("Version info not found in builds JSON")
    
            return
        }

        if (!builds.versions.includes(mcVersion)) {
            console.error("Config Minecraft version not found in builds JSON version info: " + mcVersion)
    
            return
        }

        console.info("Finding compatible builds in builds JSON for config Minecraft version: " + mcVersion)

        const compatBuilds = builds.builds.filter(build => build.version == mcVersion)

        if (!compatBuilds || compatBuilds.length <= 0) {
            console.error("No compatible builds found in builds JSON for config Minecraft version: " + mcVersion)
    
            return
        }

        const latestCompatBuild = compatBuilds[compatBuilds.length - 1]
        const downloadUrl = "https://api.papermc.io/v2/projects/paper/versions/" + mcVersion + "/builds/" + latestCompatBuild.build + "/downloads/" + latestCompatBuild.downloads.application.name

        console.info("Latest compatible build > Build: " + latestCompatBuild.build + ", Time: " + latestCompatBuild.time + ", Download URL: " + downloadUrl)

        var changes = ""

        latestCompatBuild.changes.forEach((change, index) => changes += change.summary + (index == latestCompatBuild.changes.length - 1 ? "" : ", "));

        console.info("Changes: " + changes)

        latestCompatBuildSha256 = latestCompatBuild.downloads.application.sha256

        if (verifyBuildFile(config.serverFile)) {
            console.info("Latest compatible build already installed")

            finishSuccessfully()

            return
        }

        console.info("Downloading latest compatible build...")

        foTemp = fs.createWriteStream(config.tempFile)

        https.get(downloadUrl, res => {
            if (httpsFailure(downloadUrl, res)) return

            res.pipe(foTemp)

            foTemp.on("error", err => {
                console.error("Download error: " + err)

                deleteTempFile(() => {})
            })

            foTemp.on("finish", () => closeTempFile(() => {
                console.info("Verifying downloaded latest build with SHA256...")

                if (!verifyBuildFile(config.tempFile)) {
                    console.error("Verification unsuccessful")

                    return
                }

                console.info("Verification successful - Copying temp file to server file...")

                fs.copyFileSync(config.tempFile, config.serverFile)

                finishSuccessfully()
            }))
        }).on("error", err => httpsError(downloadUrl, err))
    })
}).on("error", err => httpsError(buildsUrl, err))
