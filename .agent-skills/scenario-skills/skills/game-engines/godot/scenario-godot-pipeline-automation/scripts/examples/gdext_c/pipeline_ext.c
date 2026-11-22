/* Minimal GDExtension in plain C (scenario-godot-pipeline-automation 0.1, Godot 4.7.2, macOS arm64 clang).
 * Registers class PipelineExt (extends Object) with add(a, b) -> int. No godot-cpp, no scons:
 *   godot --headless --dump-gdextension-interface        # writes gdextension_interface.h here
 *   clang -std=c11 -O2 -shared -fPIC -I. pipeline_ext.c -o libpipeline_ext.dylib
 * It uses the 4.5-era entry points (classdb_register_extension_class4, construct_object2), still present
 * but marked deprecated in 4.7: fine for a loading smoke test; real extensions use godot-cpp. */
#include <stdlib.h>
#include <string.h>
#include "gdextension_interface.h"

static GDExtensionClassLibraryPtr lib;
static GDExtensionInterfaceStringNameNewWithLatin1Chars sn_new;
static GDExtensionInterfaceStringNewWithLatin1Chars str_new;
static GDExtensionInterfaceClassdbConstructObject2 construct_object;
static GDExtensionInterfaceObjectSetInstance set_instance;
static GDExtensionInterfaceClassdbRegisterExtensionClass4 register_class;
static GDExtensionInterfaceClassdbRegisterExtensionClassMethod register_method;
static GDExtensionInterfaceClassdbUnregisterExtensionClass unregister_class;
static GDExtensionInterfaceGetVariantFromTypeConstructor from_type_ctor;
static GDExtensionInterfaceGetVariantToTypeConstructor to_type_ctor;
static GDExtensionInterfacePrintWarning print_warning;
static GDExtensionVariantFromTypeConstructorFunc int_to_variant;
static GDExtensionTypeFromVariantConstructorFunc variant_to_int;

/* StringName and String are one pointer wide in 64-bit builds; these live for the whole session. */
static uint64_t sn_class, sn_parent, sn_add, sn_empty, sn_a, sn_b;
static uint64_t str_empty;

static GDExtensionObjectPtr create_instance(void *ud, GDExtensionBool notify) {
	(void)ud; (void)notify;
	GDExtensionObjectPtr obj = construct_object(&sn_parent);
	int *inst = calloc(1, sizeof(int));
	set_instance(obj, &sn_class, inst);
	return obj;
}

static void free_instance(void *ud, GDExtensionClassInstancePtr inst) { (void)ud; free(inst); }

/* No virtual overrides; the engine asks anyway (editor scans), so the callback must exist. */
static GDExtensionClassCallVirtual get_virtual(void *ud, GDExtensionConstStringNamePtr name, uint32_t hash) {
	(void)ud; (void)name; (void)hash;
	return NULL;
}

static void add_call(void *ud, GDExtensionClassInstancePtr inst, const GDExtensionConstVariantPtr *args,
		GDExtensionInt argc, GDExtensionVariantPtr ret, GDExtensionCallError *err) {
	(void)ud; (void)inst;
	if (argc != 2) { err->error = GDEXTENSION_CALL_ERROR_INVALID_ARGUMENT; err->argument = (int32_t)argc; err->expected = 2; return; }
	int64_t a = 0, b = 0;
	variant_to_int(&a, (GDExtensionVariantPtr)args[0]);
	variant_to_int(&b, (GDExtensionVariantPtr)args[1]);
	int64_t r = a + b;
	int_to_variant(ret, &r);
	err->error = GDEXTENSION_CALL_OK;
}

static void add_ptrcall(void *ud, GDExtensionClassInstancePtr inst, const GDExtensionConstTypePtr *args, GDExtensionTypePtr ret) {
	(void)ud; (void)inst;
	*(int64_t *)ret = *(const int64_t *)args[0] + *(const int64_t *)args[1];
}

static void initialize(void *ud, GDExtensionInitializationLevel level) {
	(void)ud;
	if (level != GDEXTENSION_INITIALIZATION_SCENE) return;
	sn_new(&sn_class, "PipelineExt", 1);
	sn_new(&sn_parent, "Object", 1);
	sn_new(&sn_add, "add", 1);
	sn_new(&sn_empty, "", 1);
	sn_new(&sn_a, "a", 1);
	sn_new(&sn_b, "b", 1);
	str_new(&str_empty, "");
	GDExtensionClassCreationInfo4 info;
	memset(&info, 0, sizeof info);
	info.is_exposed = 1;
	info.create_instance_func = create_instance;
	info.free_instance_func = free_instance;
	info.get_virtual_func = get_virtual;
	register_class(lib, &sn_class, &sn_parent, &info);
	GDExtensionPropertyInfo ret_info = {GDEXTENSION_VARIANT_TYPE_INT, &sn_empty, &sn_empty, 0, &str_empty, 6};
	GDExtensionPropertyInfo arg_info[2] = {{GDEXTENSION_VARIANT_TYPE_INT, &sn_a, &sn_empty, 0, &str_empty, 6},
										   {GDEXTENSION_VARIANT_TYPE_INT, &sn_b, &sn_empty, 0, &str_empty, 6}};
	GDExtensionClassMethodArgumentMetadata meta[2] = {GDEXTENSION_METHOD_ARGUMENT_METADATA_INT_IS_INT64,
													  GDEXTENSION_METHOD_ARGUMENT_METADATA_INT_IS_INT64};
	GDExtensionClassMethodInfo m;
	memset(&m, 0, sizeof m);
	m.name = &sn_add;
	m.call_func = add_call;
	m.ptrcall_func = add_ptrcall;
	m.method_flags = GDEXTENSION_METHOD_FLAGS_DEFAULT;
	m.has_return_value = 1;
	m.return_value_info = &ret_info;
	m.return_value_metadata = GDEXTENSION_METHOD_ARGUMENT_METADATA_INT_IS_INT64;
	m.argument_count = 2;
	m.arguments_info = arg_info;
	m.arguments_metadata = meta;
	register_method(lib, &sn_class, &m);
	print_warning("PipelineExt registered", "initialize", __FILE__, __LINE__, 0);
}

static void deinitialize(void *ud, GDExtensionInitializationLevel level) {
	(void)ud;
	if (level == GDEXTENSION_INITIALIZATION_SCENE) unregister_class(lib, &sn_class);
}

GDExtensionBool pipeline_ext_init(GDExtensionInterfaceGetProcAddress gpa, GDExtensionClassLibraryPtr p_library,
		GDExtensionInitialization *r_init) {
	lib = p_library;
	sn_new = (GDExtensionInterfaceStringNameNewWithLatin1Chars)gpa("string_name_new_with_latin1_chars");
	str_new = (GDExtensionInterfaceStringNewWithLatin1Chars)gpa("string_new_with_latin1_chars");
	construct_object = (GDExtensionInterfaceClassdbConstructObject2)gpa("classdb_construct_object2");
	set_instance = (GDExtensionInterfaceObjectSetInstance)gpa("object_set_instance");
	register_class = (GDExtensionInterfaceClassdbRegisterExtensionClass4)gpa("classdb_register_extension_class4");
	register_method = (GDExtensionInterfaceClassdbRegisterExtensionClassMethod)gpa("classdb_register_extension_class_method");
	unregister_class = (GDExtensionInterfaceClassdbUnregisterExtensionClass)gpa("classdb_unregister_extension_class");
	from_type_ctor = (GDExtensionInterfaceGetVariantFromTypeConstructor)gpa("get_variant_from_type_constructor");
	to_type_ctor = (GDExtensionInterfaceGetVariantToTypeConstructor)gpa("get_variant_to_type_constructor");
	print_warning = (GDExtensionInterfacePrintWarning)gpa("print_warning");
	if (!sn_new || !str_new || !construct_object || !set_instance || !register_class || !register_method || !from_type_ctor || !to_type_ctor)
		return 0;
	int_to_variant = from_type_ctor(GDEXTENSION_VARIANT_TYPE_INT);
	variant_to_int = to_type_ctor(GDEXTENSION_VARIANT_TYPE_INT);
	r_init->minimum_initialization_level = GDEXTENSION_INITIALIZATION_SCENE;
	r_init->userdata = NULL;
	r_init->initialize = initialize;
	r_init->deinitialize = deinitialize;
	return 1;
}
