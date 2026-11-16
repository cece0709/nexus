plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.nexus.memory"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.nexus.memory"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0-prototype"
    }
    buildTypes {
        getByName("release") { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
