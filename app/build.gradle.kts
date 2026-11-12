plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.yuxizhang.doomscroll"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.yuxizhang.doomscroll"
        minSdk = 26
        targetSdk = 35
        versionCode = 29
        versionName = "1.28"
    }

    // Release builds are signed with your own fixed key when CI provides it (GitHub secrets
    // SIGNING_KEYSTORE_BASE64 and SIGNING_PASSWORD), so updates install over the old version.
    // Without it they fall back to the debug key.
    val keystore = System.getenv("SIGNING_KEYSTORE_FILE")?.let { file(it) }?.takeIf { it.exists() }
    signingConfigs {
        if (keystore != null) {
            create("own") {
                storeFile = keystore
                storePassword = System.getenv("SIGNING_PASSWORD")
                keyAlias = "doomscroll"
                keyPassword = System.getenv("SIGNING_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.findByName("own") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // Plain JVM tests only touch logic without a device; Android calls they hit return defaults.
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    // The Android JSON classes are stubs on the JVM, so the tests bring the real ones.
    testImplementation("org.json:json:20240303")
}
