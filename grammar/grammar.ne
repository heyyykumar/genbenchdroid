start -> template | template __ module

linear -> __ module | null

2Branches ->  _ "(" innerModule ")" _ "(" innerModule ")"

3Branches ->  _ "(" innerModule ")" _ "(" innerModule ")" _ "(" innerModule ")"

innerModule -> _ module _ | _

_ -> [ ]:*

__ -> " "

# Insert position of new templates or modules

template ->
    "BasicTemplate" |
    "OnStartTemplate" |
    "OnPauseTemplate"

module ->
    "ImeiSource" linear |
    "EmptySource" linear |
    "AliasingSanitizerBridge" linear |
    "AsyncTaskBridge" linear |
    "ArraySanitizerBridge" linear |
    "BluetoothDetectionBridge" linear |
    "ButtonCallbackBridge" linear |
    "DatacontainerBridge" linear |
    "IccGlobalFieldBridge" linear |
    "IccInactiveActivity" linear |
    "IccParcel" linear |
    "ListCloneBridge" linear |
    "Obfuscation1Bridge" linear |
    "Obfuscation2Bridge" linear |
    "PauseResumeLifecycleBridge" linear |
    "PublicApiPointBridge" linear |
    "Reflection1Bridge" linear |
    "ReflectionMethod1Bridge" linear |
    "ReflectionMethod1NonSink" linear |
    "SimpleIccBridge" linear |
    "SimpleRecursionBridge" linear |
    "SimpleSanitizationBridge" linear |
    "SimpleUnreachableBridge" linear |
    "SmsSink" linear |
    "ImplicitSmsSink" linear |
    "LogSink" linear |
    "ListBridge" linear |
    "AppendToStringBridge" linear |
    "ArrayBridge" linear |
    "ArrayExampleBridge" linear |
    "StringBufferBridge" linear |
    "RandomIfElseBridge" 3Branches |
    "DImeiSource" 2Branches |
    "DEmptySource" 2Branches |
    "DAliasingSanitizerBridge" 2Branches |
    "DAsyncTaskBridge" 2Branches |
    "DArraySanitizerBridge" 2Branches |
    "DBluetoothDetectionBridge" 2Branches |
    "DButtonCallbackBridge" 2Branches |
    "DDatacontainerBridge" 2Branches |
    "DIccGlobalFieldBridge" 2Branches |
    "DIccInactiveActivity" 2Branches |
    "DIccParcel" 2Branches |
    "DListCloneBridge" 2Branches |
    "DObfuscation1Bridge" 2Branches |
    "DObfuscation2Bridge" 2Branches |
    "DPauseResumeLifecycleBridge" 2Branches |
    "DPublicApiPointBridge" 2Branches |
    "DReflection1Bridge" 2Branches |
    "DReflectionMethod1Bridge" 2Branches |
    "DReflectionMethod1NonSink" 2Branches |
    "DSimpleIccBridge" 2Branches |
    "DSimpleRecursionBridge" 2Branches |
    "DSimpleSanitizationBridge" 2Branches |
    "DSimpleUnreachableBridge" 2Branches |
    "DSmsSink" 2Branches |
    "DImplicitSmsSink" 2Branches |
    "DLogSink" 2Branches |
    "DListBridge" 2Branches |
    "DAppendToStringBridge" 2Branches |
    "DArrayBridge" 2Branches |
    "DArrayExampleBridge" 2Branches |
    "DStringBufferBridge" 2Branches