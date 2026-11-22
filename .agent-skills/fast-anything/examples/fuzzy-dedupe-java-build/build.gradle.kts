// The Java fuzzy-dedupe demo as a Gradle build:  gradle -q run
plugins {
    application
}

application {
    mainClass = "demo.App"
}

tasks.withType<JavaCompile> {
    options.release = 25
    options.encoding = "UTF-8"
}
