#include <jni.h>
#include <fbjni/fbjni.h>
#include "NitroCompassOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::nitrocompass::registerAllNatives();
  });
}